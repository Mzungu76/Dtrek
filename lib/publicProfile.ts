// Lettura pubblica (non autenticata) del sito personale di un utente (/u/[slug]) — Fase 3 del
// piano di pubblicazione (docs/raccolte-pubblicazione-piano.md): non un quarto documento
// pubblicato, ma l'INDICE di ciò che l'utente ha già reso pubblico ai tre livelli esistenti
// (Raccolta/Diario/Reportage, ciascuno con il proprio token indipendente). Niente qui decide cosa
// è pubblico — legge solo cosa lo è già.
import { loadCamminoGroups } from './cammini/diaryEntriesServer'
import { hiddenTappaActivityIds, type CamminoGroup } from './cammini/diaryEntries'
import type { MetaType, SiteType } from './metaTypes'
import { fetchSiteInfo } from './siteInfoServer'
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
/** Una singola escursione raccontata — dentro un Diario, o pubblicata da sola — nella lista
 *  "Reportage" del sito. `href` porta già al punto giusto: l'ancora `#p-N` dentro il Diario che la
 *  contiene (stessa numerazione di pagina di components/leggi/DiaryBook.tsx — vedi
 *  `resolvePublishedEntries` per come viene calcolata), o la pagina singola per un Reportage
 *  indipendente. */
export interface PublicProfileReportage {
  id: string
  title: string
  date: string
  href: string
  diary: { token: string; title: string } | null
  /** Tipologia della Meta (assente = 'sentiero'): decide etichetta e titolo di ripiego nella lista. */
  metaType?: MetaType
  siteType?: SiteType
}

/** Un luogo visitato (Sito o Borgo/Città) per la mappa d'insieme: un punto, non una traccia — mai
 *  quello in cui l'utente ha registrato la visita, ma il punto del luogo. */
export interface PublicProfilePoint {
  id: string
  title: string
  lat: number
  lon: number
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
  /** Luoghi visitati senza una traccia da disegnare (Siti e Borghi/Città) — pin sulla stessa mappa. */
  points: PublicProfilePoint[]
  /** Ordinata dalla più recente, indipendentemente dal contenitore (Diario o indipendente) — vedi
   *  PublicProfileReportage. */
  reportage: PublicProfileReportage[]
  /** Stessa preferenza di privacy usata da ogni Diario (lib/sharePublicDiary.ts) — se l'utente
   *  nasconde la data esatta lì, deve restare nascosta anche in questa lista aggregata. */
  hideExactDates: boolean
}

// Tetto di sicurezza sul numero di escursioni aggregate (mappa d'insieme + lista Reportage): un
// account con centinaia di uscite pubblicate non deve poter far esplodere il carico di UNA pagina
// — le più recenti contano più delle più vecchie per entrambi gli usi di questa lista.
const MAX_PUBLISHED_ENTRIES = 300

export async function fetchPublicProfile(rawSlug: string): Promise<PublicProfile | null> {
  const slug = normalizeSlug(rawSlug)
  if (!slug) return null

  const { data: settings } = await supabase
    .from('user_settings')
    .select('user_id, display_name, profile_enabled, profile_bio, starting_lat, starting_lon, publish_hide_home_starts, publish_hide_exact_dates')
    .eq('profile_slug', slug)
    .maybeSingle()
  if (!settings || !settings.profile_enabled) return null

  const userId = settings.user_id as string
  const home: HomePoint | null = (settings.starting_lat != null && settings.starting_lon != null)
    ? { lat: settings.starting_lat as number, lon: settings.starting_lon as number }
    : null
  const hideHomeStarts = (settings.publish_hide_home_starts as boolean | null) ?? true
  const hideExactDates = (settings.publish_hide_exact_dates as boolean | null) ?? false

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

  const { routes, points, reportage } = await resolvePublishedEntries(userId, diaries ?? [], reports ?? [], home, hideHomeStarts)

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
      token: r.share_token as string, title: (r.title as string) || 'Reportage',
      createdAt: r.created_at as string,
    })),
    routes,
    points,
    reportage,
    hideExactDates,
  }
}

type DiaryRow = { id: string; title: string; share_token: string; config: unknown }
type ReportRow = { id: string; activity_id: string; title: string; share_token: string; created_at: string }

/**
 * Nucleo condiviso da due usi diversi della stessa aggregazione — la mappa d'insieme del sito
 * (`routes`) e la lista "Reportage" con tag Diario (`reportage`) — invece di due funzioni separate
 * che rifarebbero le stesse query. Scritta apposta invece di richiamare N volte
 * `fetchDiaryContent` (lib/sharePublicDiary.ts): quella funzione, corretta per UN Diario alla
 * volta, porta con sé `track_points`/foto/serie altimetriche che qui non servono — moltiplicato
 * per ogni Diario dell'utente sarebbe il tipo di costo che questo giro di lavoro sulla velocità
 * del sito cerca di evitare, non di aggiungere. Qui si leggono solo le colonne che servono a
 * disegnare una linea e a comporre una riga di elenco.
 *
 * Rispetta le stesse due regole di privacy/scelta dell'autore della pagina di un Diario:
 * l'esclusione per-Diario (`config.excludedActivityIds`) e il taglio del punto di partenza vicino
 * casa (`trimHomeStart`) — un'aggregazione che mostrasse PIÙ di quanto il Diario stesso mostra
 * sarebbe una perdita di privacy silenziosa, non solo un'incoerenza.
 */
async function resolvePublishedEntries(
  userId: string,
  diaries: DiaryRow[],
  reports: ReportRow[],
  home: HomePoint | null,
  hideHomeStarts: boolean,
): Promise<{ routes: PublicProfileRoute[]; points: PublicProfilePoint[]; reportage: PublicProfileReportage[] }> {
  const diaryIds = diaries.map(d => d.id)
  const diaryById = new Map(diaries.map(d => [d.id, d]))
  const excludedByDiary = new Map(
    diaries.map(d => [d.id, new Set(normalizeDiaryConfig(d.config).excludedActivityIds)]),
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
  // Cammini: una sola voce per cammino, mai una per tappa (stessa regola del Diario pubblico).
  let cammini: CamminoGroup[] = []
  if (diaryIds.length > 0 && diaryActivityIds.length > 0) {
    const { data: percorsiDiari } = await supabase.from('planned_hikes').select('id').eq('user_id', userId).in('diary_id', diaryIds)
    cammini = await loadCamminoGroups(userId, (percorsiDiari ?? []).map(p => p.id as string))
  }
  const hiddenTappe = hiddenTappaActivityIds(cammini)
  diaryActivityIds = diaryActivityIds.filter(a => !hiddenTappe.has(a.activityId))
  const diaryIdByActivity = new Map(diaryActivityIds.map(a => [a.activityId, a.diaryId]))

  const reportActivityIds = reports.map(r => r.activity_id).filter(Boolean).filter(id => !hiddenTappe.has(id))
  const allActivityIds = Array.from(new Set([...diaryActivityIds.map(a => a.activityId), ...reportActivityIds]))
  if (allActivityIds.length === 0) return { routes: [], points: [], reportage: [] }

  // Titoli dai Reportage — un Diario mostra solo attività con un Reportage scritto (mai la sola
  // Meta camminata senza racconto), stessa regola di fetchDiaryContent: qui basta per associare un
  // titolo leggibile a ogni traccia, senza tirare dentro contenuto/foto.
  const { data: hikeReports } = await supabase
    .from('hike_reports').select('id, activity_id, title')
    .eq('user_id', userId).in('activity_id', allActivityIds)
  const reportByActivity = new Map<string, { id: string; title: string }>()
  for (const r of reports) reportByActivity.set(r.activity_id, { id: r.id, title: r.title })
  for (const r of hikeReports ?? []) {
    if (!reportByActivity.has(r.activity_id as string)) {
      reportByActivity.set(r.activity_id as string, { id: r.id as string, title: (r.title as string) || 'Reportage' })
    }
  }
  for (const g of cammini) if (g.content.trim() && diaryIdByActivity.has(g.repActivityId)) reportByActivity.set(g.repActivityId, { id: `cammino:${g.hikeId}`, title: g.name })

  // Solo le attività che hanno davvero un Reportage (diario o standalone) contano come "escursione
  // pubblicata" — una Meta camminata ma mai raccontata non compare in nessun Diario, quindi non
  // deve comparire nemmeno qui. Le più recenti prima del tetto di sicurezza: `start_time` serve
  // comunque per ordinare, quindi si legge prima di tagliare.
  const publishedActivityIds = allActivityIds.filter(id => reportByActivity.has(id))
  if (publishedActivityIds.length === 0) return { routes: [], points: [], reportage: [] }

  const { data: activities } = await supabase
    .from('activities').select('id, start_time, route_polyline, meta_type, site_type, linked_planned_id')
    .in('id', publishedActivityIds)
  const dateByActivity = new Map<string, string>()
  const polylineByActivity = new Map<string, [number, number][] | null>()
  const metaByActivity = new Map<string, { metaType: MetaType; siteType?: SiteType }>()
  for (const a of activities ?? []) {
    dateByActivity.set(a.id as string, (a.start_time as string) ?? '')
    metaByActivity.set(a.id as string, { metaType: ((a.meta_type as MetaType | null) ?? 'sentiero'), siteType: (a.site_type as SiteType | null) ?? undefined })
    const raw = a.route_polyline
    const full = Array.isArray(raw) && raw.length > 1 ? (raw as [number, number][]) : null
    polylineByActivity.set(a.id as string, full && hideHomeStarts ? trimHomeStart(full, home) : full)
  }

  // Il tracciato di un cammino è quello di tutte le sue tappe, non solo della prima.
  const published = new Set(publishedActivityIds)
  for (const g of cammini.filter(c => published.has(c.repActivityId))) {
    const { data: tappe } = await supabase.from('activities').select('id, start_time, route_polyline').in('id', g.tappaActivityIds)
    const full = (tappe ?? [])
      .sort((x, y) => new Date(x.start_time as string).getTime() - new Date(y.start_time as string).getTime())
      .flatMap(t => (Array.isArray(t.route_polyline) ? (t.route_polyline as [number, number][]) : []))
    if (full.length > 1) polylineByActivity.set(g.repActivityId, hideHomeStarts ? trimHomeStart(full, home) : full)
    metaByActivity.set(g.repActivityId, { metaType: 'cammino' })
  }

  // Punti dei luoghi visitati (Siti e Borghi/Città) — lib/siteInfoServer.ts, best-effort.
  const siteInfo = await fetchSiteInfo((activities ?? []) as { id: string; meta_type?: string | null; linked_planned_id?: string | null }[])

  // Numero di pagina dentro il Diario (per l'ancora `#p-N`): stessa numerazione di DiaryBook
  // (Sommario = pagina 1, poi le escursioni in ordine cronologico crescente a partire da 2) —
  // ricalcolata qui sulle sole attività scoped a QUESTO Diario, non sull'intera lista.
  const pageIndexByActivity = new Map<string, number>()
  const entriesByDiary = new Map<string, string[]>()
  for (const id of publishedActivityIds) {
    const diaryId = diaryIdByActivity.get(id)
    if (!diaryId) continue
    const list = entriesByDiary.get(diaryId) ?? []
    list.push(id)
    entriesByDiary.set(diaryId, list)
  }
  entriesByDiary.forEach(activityIds => {
    activityIds
      .slice()
      .sort((a, b) => new Date(dateByActivity.get(a) ?? 0).getTime() - new Date(dateByActivity.get(b) ?? 0).getTime())
      .forEach((id, i) => pageIndexByActivity.set(id, i + 2))
  })

  const mostRecentFirst = publishedActivityIds
    .slice()
    .sort((a, b) => new Date(dateByActivity.get(b) ?? 0).getTime() - new Date(dateByActivity.get(a) ?? 0).getTime())
    .slice(0, MAX_PUBLISHED_ENTRIES)

  const routes: PublicProfileRoute[] = []
  const points: PublicProfilePoint[] = []
  const reportage: PublicProfileReportage[] = []
  for (const activityId of mostRecentFirst) {
    const meta = reportByActivity.get(activityId)!
    const polyline = polylineByActivity.get(activityId) ?? null
    if (polyline && polyline.length > 1) routes.push({ id: meta.id, title: meta.title, polyline })
    // Una visita senza traccia (Sito, o Borgo/Città non camminato con GPS) compare come pin sul suo luogo.
    const sitePoint = siteInfo.get(activityId)?.point
    if ((!polyline || polyline.length <= 1) && sitePoint) points.push({ id: meta.id, title: meta.title, lat: sitePoint.lat, lon: sitePoint.lon })

    const diaryId = diaryIdByActivity.get(activityId)
    const diaryRow = diaryId ? diaryById.get(diaryId) : undefined
    const diary = diaryRow ? { token: diaryRow.share_token, title: diaryRow.title } : null
    const pageIndex = diaryId ? pageIndexByActivity.get(activityId) : undefined
    const standaloneToken = reports.find(r => r.activity_id === activityId)?.share_token
    const href = diary && pageIndex
      ? `/leggi/d/${diary.token}#p-${pageIndex}`
      : standaloneToken
        ? `/leggi/p/${standaloneToken}`
        : null
    if (!href) continue // né un Diario raggiungibile né un token proprio — non linkabile, si scarta

    reportage.push({
      id: meta.id, title: meta.title, date: dateByActivity.get(activityId) || '', href, diary,
      metaType: metaByActivity.get(activityId)?.metaType, siteType: metaByActivity.get(activityId)?.siteType,
    })
  }

  return { routes, points, reportage }
}
