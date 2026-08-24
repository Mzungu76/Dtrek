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

import { supabase } from './supabase'
import { normalizeDiaryConfig, type DiaryConfig } from './diaryConfig'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export interface PublicDiary {
  ownerName:          string
  /** `null` finché l'utente non esporta e pubblica un PDF: la pagina funziona lo stesso. */
  pdfUrl:             string | null
  config:             DiaryConfig
  entries:            PublicDiaryEntry[]
  totalKm:            number
  totalElevationGain: number
  dateRangeLabel?:    string
}

/** Un resoconto le cui sezioni esistono ma sono tutte vuote (`## Titolo` senza testo sotto) non è
 *  un racconto: va presentato come scheda compatta. Soglia bassa e non zero perché le sole
 *  intestazioni pesano già ~70 caratteri. */
export function hasNarrative(content: string): boolean {
  return content.replace(/^##.*$/gm, '').trim().length > 0
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
  let percorsoIds: string[] | null = null // null = nessuno scoping per Diario (vecchio percorso)

  if (diary) {
    userId = diary.user_id as string
    config = normalizeDiaryConfig({
      ...(diary.config as object),
      title: diary.title, subtitle: diary.subtitle, author: diary.author,
      coverUrl: diary.cover_url, footerText: diary.footer_text,
    })
    pdfUrl = (diary.share_pdf_url as string) ?? null

    const { data: percorsi } = await supabase
      .from('planned_hikes')
      .select('id')
      .eq('user_id', userId)
      .eq('diary_id', diary.id as string)
    percorsoIds = (percorsi ?? []).map(p => p.id as string)
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

  const { data: settingsForName } = await supabase
    .from('user_settings')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()

  const excluded = new Set(config.excludedActivityIds)

  // Percorso genitore assente ⇒ nessun Reportage per questo Diario, senza nemmeno interrogare
  // hike_reports (Diario appena creato, o senza ancora un solo Percorso — mai pubblicabile finché
  // non lo è, ma il link stesso resta comunque valido).
  let reports: { id: string; activity_id: string; title: string; content: string; created_at: string }[] = []
  if (percorsoIds === null) {
    // Vecchio Diario singolo per utente: nessuno scoping, tutti i resoconti dell'utente.
    const { data } = await supabase
      .from('hike_reports')
      .select('id, activity_id, title, content, created_at')
      .eq('user_id', userId)
    reports = data ?? []
  } else if (percorsoIds.length > 0) {
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
      const polyline = Array.isArray(raw) && raw.length > 1
        ? (raw as [number, number][])
        : null
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
          const chosen = config.photoIdsByActivity[r.activity_id as string]
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

  return {
    ownerName: (settingsForName?.display_name as string) || 'Escursionista',
    pdfUrl,
    config,
    entries,
    totalKm,
    totalElevationGain,
    dateRangeLabel,
  }
}
