// Lettura pubblica (non autenticata) del Diario, dietro token opaco — stesso principio di
// lib/sharePublic.ts per le singole attività: usa il client service-role, che scavalca la RLS, ma
// l'accesso è comunque delimitato dal solo `diary_token` indovinabile-mai (UUID).
//
// DUE CAMBI DI FONDO rispetto alla prima versione, entrambi per lo stesso difetto: la condivisione
// era ostaggio di un file da 21 MB.
//
//  1. NON SERVE PIÙ UN PDF. Prima la query filtrava `.not('diary_pdf_url','is',null)`, quindi il
//     link pubblico *non esisteva* finché l'utente non era riuscito a caricare il PDF sullo
//     Storage. Su un telefono quell'upload si pianta facilmente (il documento pesava 387 KB per
//     pagina), e con esso si piantava tutta la condivisione. Ora il link vive da sé: il PDF, se
//     c'è, è un allegato in più.
//
//  2. IL CONTENUTO VIENE SERVITO DAVVERO. Prima questo modulo restituiva di proposito «niente
//     contenuto narrativo dei resoconti — il racconto completo resta nel PDF», e la pagina
//     pubblica era un guscio attorno a un visualizzatore PDF: chi riceveva il link su WhatsApp
//     doveva scaricare 21 MB per leggere una riga. Ora il racconto, le foto e la traccia arrivano
//     con la pagina, che può quindi essere una vera rivista web leggibile da telefono.
//
// FASE 3 (docs/raccolte-pubblicazione-piano.md) — questo file è stato spezzato in due metà:
// "trova il Diario dal token" (`fetchPublicDiary`, invariato nel comportamento) e "costruisci il
// contenuto pubblico di UN Diario" (`fetchDiaryContent`, esportata). La Raccolta
// (`lib/sharePublicCollection.ts`) ha bisogno solo della seconda, chiamata una volta per ogni
// Diario che contiene — così l'esclusione dei Reportage e la selezione delle foto di ciascun
// Diario si applicano da sole dentro una raccolta, senza essere riscritte lì.

import { supabase } from './supabase'
import { normalizeDiaryConfig, type DiaryConfig } from './diaryConfig'
import { trimHomeStart, type HomePoint } from './privacy/trimHomeStart'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Preferenze di privacy dell'autore (docs/raccolte-pubblicazione-piano.md, Fase 3f) — globali per
 *  utente (`user_settings`), non per Diario o Raccolta: applicate qui, nel core condiviso da
 *  entrambi, così proteggono ogni livello di pubblicazione senza essere implementate due volte. */
export interface PublicPrivacyPrefs {
  home:           HomePoint | null
  hideHomeStarts: boolean
  hideExactDates: boolean
}

export interface PublicDiaryPhoto {
  /** Serve a rispettare la selezione dell'autore (`photoIdsByActivity`). */
  id:       string
  url:      string
  caption:  string | null
  /** Posizione lungo il percorso (0–1), per collocare il pin sullo schizzo della traccia. */
  progress: number | null
}

export interface PublicDiaryEntry {
  id:                string
  title:             string
  startTime:         string
  distanceMeters:    number
  elevationGain:     number
  totalTimeSeconds:  number
  altitudeMax:       number | null
  calories:          number | null
  /** Markdown del resoconto. Stringa vuota se l'utente non l'ha ancora scritto: in quel caso la
   *  pagina mostra una scheda compatta invece di uno spazio narrativo vuoto. */
  content:           string
  photos:            PublicDiaryPhoto[]
  /** `[[lat, lon], …]`, già ridotta a ~60 punti a monte (lib/downsamplePolyline.ts). `null` se
   *  l'attività non ha traccia GPS. */
  polyline:          [number, number][] | null
}

/** Il contenuto pubblico di un Diario, senza i campi che appartengono al documento che lo
 *  contiene (proprietario, PDF, config di presentazione) — quelli restano a `fetchPublicDiary` e,
 *  per la Raccolta, a `fetchPublicCollection`. */
export interface DiaryContent {
  entries:            PublicDiaryEntry[]
  totalKm:            number
  totalElevationGain: number
  dateRangeLabel?:    string
  /** Se true, le pagine di lettura mostrano solo mese/anno di ogni escursione invece della data
   *  esatta (lib/privacy/formatPublicDate.ts) — preferenza dell'autore, non del singolo Reportage. */
  hideExactDates:     boolean
}

export interface PublicDiary extends DiaryContent {
  ownerName: string
  /** `null` finché l'utente non esporta e pubblica un PDF: la pagina funziona lo stesso. */
  pdfUrl:    string | null
  config:    DiaryConfig
}

/** Un resoconto le cui sezioni esistono ma sono tutte vuote (`## Titolo` senza testo sotto) non è
 *  un racconto: va presentato come scheda compatta. Soglia bassa e non zero perché le sole
 *  intestazioni pesano già ~70 caratteri. */
export function hasNarrative(content: string): boolean {
  return content.replace(/^##.*$/gm, '').trim().length > 0
}

type RawHikeReport = { id: string; activity_id: string; title: string; content: string; created_at: string }

/** Da un elenco già letto di `hike_reports` (scoped o meno, non importa qui) a `DiaryContent`
 *  completo: applica l'esclusione, carica attività/foto dei soli Reportage visibili, ordina per
 *  data e somma i totali. Condivisa dai due modi di trovare quei report (Diario reale scoped per
 *  `diary_id`, o il vecchio Diario singolo per utente senza scoping) — la parte che segue
 *  l'esclusione non dipende da come ci si è arrivati. */
async function buildContentFromReports(
  reports: RawHikeReport[],
  excluded: Set<string>,
  photoIdsByActivity: Record<string, string[]>,
  privacy: PublicPrivacyPrefs,
): Promise<DiaryContent> {
  const visibleReports = reports.filter(r => !excluded.has(r.activity_id))
  const activityIds = visibleReports.map(r => r.activity_id as string).filter(Boolean)

  // Le due letture dipendono entrambe solo da `activityIds`: si fanno insieme, non in fila.
  const [{ data: activities }, { data: photos }] = activityIds.length
    ? await Promise.all([
        supabase
          .from('activities')
          .select('id, start_time, distance_meters, elevation_gain, total_time_seconds, altitude_max, calories, route_polyline')
          .in('id', activityIds),
        supabase
          .from('activity_photos')
          .select('id, activity_id, url, caption, progress')
          .in('activity_id', activityIds),
      ])
    : [{ data: [] }, { data: [] }]

  const actMap = new Map((activities ?? []).map((a: Record<string, unknown>) => [a.id as string, a]))

  const photosByActivity = new Map<string, PublicDiaryPhoto[]>()
  for (const p of photos ?? []) {
    const key = p.activity_id as string
    const list = photosByActivity.get(key) ?? []
    list.push({
      id:       p.id as string,
      url:      p.url as string,
      caption:  (p.caption as string) || null,
      progress: typeof p.progress === 'number' ? p.progress : null,
    })
    photosByActivity.set(key, list)
  }
  // Ordine di percorrenza, non di caricamento: le foto raccontano l'escursione nella sequenza in
  // cui sono state scattate lungo la traccia.
  photosByActivity.forEach(list => {
    list.sort((a, b) => (a.progress ?? 1) - (b.progress ?? 1))
  })

  const entries: PublicDiaryEntry[] = visibleReports
    .map(r => {
      const act = actMap.get(r.activity_id as string)
      const raw = act?.route_polyline
      const fullPolyline = Array.isArray(raw) && raw.length > 1
        ? (raw as [number, number][])
        : null
      const polyline = fullPolyline && privacy.hideHomeStarts
        ? trimHomeStart(fullPolyline, privacy.home)
        : fullPolyline
      return {
        id:               r.id as string,
        title:            (r.title as string) || 'Escursione',
        startTime:        (act?.start_time as string) ?? (r.created_at as string),
        distanceMeters:   (act?.distance_meters as number) ?? 0,
        elevationGain:    (act?.elevation_gain as number) ?? 0,
        totalTimeSeconds: (act?.total_time_seconds as number) ?? 0,
        altitudeMax:      (act?.altitude_max as number) ?? null,
        calories:         (act?.calories as number) ?? null,
        content:          (r.content as string) ?? '',
        // La scelta fatta nel Diario vale anche qui: `photoIdsByActivity` dice quali foto l'autore
        // vuole pubblicare. Il PDF ne stampa comunque un sottoinsieme distribuito; il sito, che non
        // ha vincoli di impaginazione, le mostra tutte quelle scelte.
        photos:           (() => {
          const all = photosByActivity.get(r.activity_id as string) ?? []
          const chosen = photoIdsByActivity[r.activity_id as string]
          return chosen && chosen.length > 0 ? all.filter(p => chosen.includes(p.id)) : all
        })(),
        polyline,
      }
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  const totalKm = entries.reduce((s, e) => s + e.distanceMeters, 0) / 1000
  const totalElevationGain = entries.reduce((s, e) => s + e.elevationGain, 0)

  let dateRangeLabel: string | undefined
  if (entries.length > 0) {
    const firstYear = new Date(entries[0].startTime).getFullYear()
    const lastYear  = new Date(entries[entries.length - 1].startTime).getFullYear()
    dateRangeLabel = firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`
  }

  return { entries, totalKm, totalElevationGain, dateRangeLabel, hideExactDates: privacy.hideExactDates }
}

/**
 * Contenuto pubblico di UN Diario reale, scoped per `diary_id` — mai per il vecchio Diario
 * singolo per utente (quel ramo non ha un `diary_id` da scopare, resta gestito inline in
 * `fetchPublicDiary`). Nucleo condiviso da Diario e Raccolta: vedi il commento in cima al file.
 */
export async function fetchDiaryContent(
  userId: string,
  diaryId: string,
  excluded: Set<string>,
  photoIdsByActivity: Record<string, string[]>,
  privacy: PublicPrivacyPrefs,
): Promise<DiaryContent> {
  // Una Meta non ha una colonna diary_id "propria" del suo Diario finché non viene camminata
  // (vedi app/api/planned/route.ts) — quindi il Diario di ogni Reportage si ricava passando dalla
  // sua Meta collegata, non da una colonna diretta su activities/hike_reports.
  const { data: percorsi } = await supabase
    .from('planned_hikes')
    .select('id')
    .eq('user_id', userId)
    .eq('diary_id', diaryId)
  const percorsoIds = (percorsi ?? []).map(p => p.id as string)

  let reports: RawHikeReport[] = []
  if (percorsoIds.length > 0) {
    const { data: scopedActivities } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', userId)
      .in('linked_planned_id', percorsoIds)
    const scopedActivityIds = (scopedActivities ?? []).map(a => a.id as string)
    if (scopedActivityIds.length > 0) {
      const { data } = await supabase
        .from('hike_reports')
        .select('id, activity_id, title, content, created_at')
        .eq('user_id', userId)
        .in('activity_id', scopedActivityIds)
      reports = data ?? []
    }
  }

  return buildContentFromReports(reports, excluded, photoIdsByActivity, privacy)
}

export async function fetchPublicDiary(token: string): Promise<PublicDiary | null> {
  if (!UUID_RE.test(token)) return null

  // Prima si cerca tra i Diari multipli (docs/diario-fulcro-piano.md Fase 4): ogni Diario ha il
  // proprio share_token. Se non trovato, si ricade sul vecchio Diario singolo per utente
  // (user_settings.diary_token) — non ancora migrato o dietro il vecchio /diario, che resta
  // invariato finché non viene ritirato (Fase 7).
  const { data: diary } = await supabase
    .from('diaries')
    .select('id, user_id, title, subtitle, author, cover_url, footer_text, config, share_pdf_url')
    .eq('share_token', token)
    .maybeSingle()

  let userId: string
  let config: DiaryConfig
  let pdfUrl: string | null

  if (diary) {
    userId = diary.user_id as string
    config = normalizeDiaryConfig({
      ...(diary.config as object),
      title: diary.title, subtitle: diary.subtitle, author: diary.author,
      coverUrl: diary.cover_url, footerText: diary.footer_text,
    })
    pdfUrl = (diary.share_pdf_url as string) ?? null
  } else {
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('user_id, diary_pdf_url, diary_config')
      .eq('diary_token', token)
      .maybeSingle()
    if (error || !settings) return null
    userId = settings.user_id as string
    config = normalizeDiaryConfig(settings.diary_config)
    pdfUrl = (settings.diary_pdf_url as string) ?? null
  }

  // Nome dell'autore + preferenze di privacy, in un'unica lettura di user_settings — le seconde
  // servono a fetchDiaryContent/buildContentFromReports sotto, quindi vanno risolte prima di loro.
  const { data: ownerSettings } = await supabase
    .from('user_settings')
    .select('display_name, starting_lat, starting_lon, publish_hide_home_starts, publish_hide_exact_dates')
    .eq('user_id', userId)
    .maybeSingle()

  const privacy: PublicPrivacyPrefs = {
    home: (ownerSettings?.starting_lat != null && ownerSettings?.starting_lon != null)
      ? { lat: ownerSettings.starting_lat as number, lon: ownerSettings.starting_lon as number }
      : null,
    hideHomeStarts: (ownerSettings?.publish_hide_home_starts as boolean | null) ?? true,
    hideExactDates: (ownerSettings?.publish_hide_exact_dates as boolean | null) ?? false,
  }

  let content: DiaryContent
  if (diary) {
    content = await fetchDiaryContent(
      userId, diary.id as string, new Set(config.excludedActivityIds), config.photoIdsByActivity, privacy,
    )
  } else {
    // Vecchio Diario singolo per utente: nessuno scoping, tutti i resoconti dell'utente.
    const { data } = await supabase
      .from('hike_reports')
      .select('id, activity_id, title, content, created_at')
      .eq('user_id', userId)
    content = await buildContentFromReports(data ?? [], new Set(config.excludedActivityIds), config.photoIdsByActivity, privacy)
  }

  return {
    ownerName: (ownerSettings?.display_name as string) || 'Escursionista',
    pdfUrl,
    config,
    ...content,
  }
}
