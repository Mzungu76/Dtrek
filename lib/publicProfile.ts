// Lettura pubblica (non autenticata) del sito personale di un utente (/u/[slug]) — Fase 3 del
// piano di pubblicazione (docs/raccolte-pubblicazione-piano.md): non un quarto documento
// pubblicato, ma l'INDICE di ciò che l'utente ha già reso pubblico ai tre livelli esistenti
// (Raccolta/Diario/Reportage, ciascuno con il proprio token indipendente). Niente qui decide cosa
// è pubblico — legge solo cosa lo è già.
import { supabase } from './supabase'
import { normalizeSlug } from './profileSlug'
import { normalizeDiaryConfig } from './diaryConfig'
import { trimHomeStart, type HomePoint } from './privacy/trimHomeStart'

export interface PublicProfileCollection {
  token: string
  title: string
  subtitle: string
  coverUrl: string | null
  updatedAt: string
}
export interface PublicProfileDiary {
  token: string
  title: string
  subtitle: string
  coverUrl: string | null
  updatedAt: string
}
export interface PublicProfileReport {
  token: string
  title: string
  createdAt: string
}
/** Un percorso per la mappa d'insieme del sito — stessa forma di AtlasRoute
 *  (app/leggi/d/[token]/AllRoutesMap.tsx), qui aggregata su TUTTI i Diari/Reportage pubblicati
 *  dell'utente invece che su uno solo. */
export interface PublicProfileRoute {
  id: string
  title: string
  polyline: [number, number][]
}

export interface PublicProfile {
  displayName: string
  /** Riga di presentazione libera sotto il nome — vuota finché l'utente non la scrive in
   *  Impostazioni (components/profilo/SectionProfiloPubblico.tsx). */
  bio: string
  collections: PublicProfileCollection[]
  diaries: PublicProfileDiary[]
  reports: PublicProfileReport[]
  routes: PublicProfileRoute[]
}

const MAX_OVERVIEW_ROUTES = 150

export async function fetchPublicProfile(rawSlug: string): Promise<PublicProfile | null> {
  const slug = normalizeSlug(rawSlug)
  if (!slug) return null

  const { data: settings } = await supabase
    .from('user_settings')
    .select('user_id, display_name, profile_enabled, profile_bio, starting_lat, starting_lon, publish_hide_home_starts')
    .eq('profile_slug', slug)
    .maybeSingle()
  if (!settings || !settings.profile_enabled) return null

  const userId = settings.user_id as string
  const home: HomePoint | null = (settings.starting_lat != null && settings.starting_lon != null)
    ? { lat: settings.starting_lat as number, lon: settings.starting_lon as number }
    : null
  const hideHomeStarts = (settings.publish_hide_home_starts as boolean | null) ?? true

  // Ogni livello resta indipendente (docs/raccolte-pubblicazione-piano.md: "pubblicare una
  // raccolta NON pubblica i Diari singoli") — qui si elenca semplicemente tutto ciò che ha GIÀ un
  // proprio token, senza dedurre appartenenza o dedurre esclusioni fra un livello e l'altro.
  //
  // I Diari sono ordinati per `updated_at` (il più curato/aggiornato di recente prima), non più
  // per titolo: su un sito che si presenta come "l'ultimo lavoro dell'autore", l'ordine alfabetico
  // nascondeva l'uscita più recente in mezzo alla lista.
  const [{ data: collections }, { data: diaries }, { data: reports }] = await Promise.all([
    supabase.from('collections').select('title, subtitle, cover_url, share_token, position, updated_at')
      .eq('user_id', userId).not('share_token', 'is', null).order('position', { ascending: true }),
    supabase.from('diaries').select('id, title, subtitle, cover_url, share_token, config, updated_at')
      .eq('user_id', userId).not('share_token', 'is', null).order('updated_at', { ascending: false }),
    supabase.from('hike_reports').select('id, activity_id, title, share_token, created_at')
      .eq('user_id', userId).not('share_token', 'is', null).order('created_at', { ascending: false }),
  ])

  const routes = await fetchOverviewRoutes(userId, diaries ?? [], reports ?? [], home, hideHomeStarts)

  return {
    displayName: (settings.display_name as string) || 'Escursionista',
    bio: (settings.profile_bio as string) ?? '',
    collections: (collections ?? []).map(c => ({
      token: c.share_token as string, title: c.title as string,
      subtitle: (c.subtitle as string) ?? '', coverUrl: (c.cover_url as string) ?? null,
      updatedAt: c.updated_at as string,
    })),
    diaries: (diaries ?? []).map(d => ({
      token: d.share_token as string, title: d.title as string,
      subtitle: (d.subtitle as string) ?? '', coverUrl: (d.cover_url as string) ?? null,
      updatedAt: d.updated_at as string,
    })),
    reports: (reports ?? []).map(r => ({
      token: r.share_token as string, title: (r.title as string) || 'Escursione',
      createdAt: r.created_at as string,
    })),
    routes,
  }
}

/**
 * Mappa d'insieme del sito: aggrega le tracce di tutti i Diari pubblicati + tutti i Reportage
 * pubblicati singolarmente. Scritta apposta invece di richiamare N volte `fetchDiaryContent`
 * (lib/sharePublicDiary.ts): quella funzione, corretta per UN Diario alla volta, porta con sé
 * `track_points`/foto/serie altimetriche che qui non servono — moltiplicato per ogni Diario
 * dell'utente sarebbe il tipo di costo che questo giro di lavoro sulla velocità del sito cerca di
 * evitare, non di aggiungere. Qui si leggono solo le colonne che servono per disegnare una linea:
 * `route_polyline` (già ridotta a monte, lib/downsamplePolyline.ts) e il titolo del Reportage.
 *
 * Rispetta le stesse due regole di privacy/scelta dell'autore della pagina di un Diario:
 * l'esclusione per-Diario (`config.excludedActivityIds`) e il taglio del punto di partenza vicino
 * casa (`trimHomeStart`) — un'aggregazione che mostrasse PIÙ di quanto il Diario stesso mostra
 * sarebbe una perdita di privacy silenziosa, non solo un'incoerenza.
 */
async function fetchOverviewRoutes(
  userId: string,
  diaries: { id: string; config: unknown }[],
  reports: { id: string; activity_id: string; title: string }[],
  home: HomePoint | null,
  hideHomeStarts: boolean,
): Promise<PublicProfileRoute[]> {
  const diaryIds = diaries.map(d => d.id as string)
  const excludedByDiary = new Map(
    diaries.map(d => [d.id as string, new Set(normalizeDiaryConfig(d.config).excludedActivityIds)]),
  )

  // Un Reportage non porta una colonna diary_id propria: appartiene a un Diario passando dalla sua
  // Meta collegata (planned_hikes.diary_id → activities.linked_planned_id), stesso percorso di
  // fetchDiaryContent — vedi il commento lì per il perché.
  let diaryActivityIds: { activityId: string; diaryId: string }[] = []
  if (diaryIds.length > 0) {
    const { data: percorsi } = await supabase
      .from('planned_hikes').select('id, diary_id')
      .eq('user_id', userId).in('diary_id', diaryIds)
    const diaryByPercorso = new Map((percorsi ?? []).map(p => [p.id as string, p.diary_id as string]))
    const percorsoIds = Array.from(diaryByPercorso.keys())
    if (percorsoIds.length > 0) {
      const { data: linkedActivities } = await supabase
        .from('activities').select('id, linked_planned_id')
        .eq('user_id', userId).in('linked_planned_id', percorsoIds)
      diaryActivityIds = (linkedActivities ?? [])
        .map(a => ({ activityId: a.id as string, diaryId: diaryByPercorso.get(a.linked_planned_id as string) as string }))
        .filter(a => !excludedByDiary.get(a.diaryId)?.has(a.activityId))
    }
  }

  const reportActivityIds = reports.map(r => r.activity_id).filter(Boolean)
  const allActivityIds = Array.from(new Set([...diaryActivityIds.map(a => a.activityId), ...reportActivityIds]))
  if (allActivityIds.length === 0) return []

  // Titoli dai Reportage — un Diario mostra solo attività con un Reportage scritto (mai la sola
  // Meta camminata senza racconto), stessa regola di fetchDiaryContent: qui basta per associare un
  // titolo leggibile a ogni traccia, senza tirare dentro contenuto/foto.
  const { data: hikeReports } = await supabase
    .from('hike_reports').select('id, activity_id, title')
    .eq('user_id', userId).in('activity_id', allActivityIds)
  const titleByActivity = new Map<string, { id: string; title: string }>()
  for (const r of reports) titleByActivity.set(r.activity_id, { id: r.id, title: r.title })
  for (const r of hikeReports ?? []) {
    if (!titleByActivity.has(r.activity_id as string)) {
      titleByActivity.set(r.activity_id as string, { id: r.id as string, title: (r.title as string) || 'Escursione' })
    }
  }

  // Solo le attività che hanno davvero un Reportage (diario o standalone) contano come "traccia
  // pubblicata" — un'attività camminata ma mai raccontata non compare in nessun Diario, quindi non
  // deve comparire nemmeno qui.
  const publishedActivityIds = allActivityIds.filter(id => titleByActivity.has(id))
  if (publishedActivityIds.length === 0) return []

  const { data: activities } = await supabase
    .from('activities').select('id, route_polyline')
    .in('id', publishedActivityIds.slice(0, MAX_OVERVIEW_ROUTES))

  return (activities ?? [])
    .map(a => {
      const raw = a.route_polyline
      const full = Array.isArray(raw) && raw.length > 1 ? (raw as [number, number][]) : null
      if (!full) return null
      const polyline = hideHomeStarts ? trimHomeStart(full, home) : full
      const meta = titleByActivity.get(a.id as string)!
      return { id: meta.id, title: meta.title, polyline }
    })
    .filter((r): r is PublicProfileRoute => r !== null && r.polyline.length > 1)
}
