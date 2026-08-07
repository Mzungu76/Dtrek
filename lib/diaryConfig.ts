// Configurazione del Diario — prima viveva sparsa in sei chiavi diverse di `localStorage`
// (`dtrek_diary_title`, `dtrek_diary_cover`, `dtrek_diary_stats`, …), quindi non seguiva l'utente
// tra dispositivi: aprire il Diario dal telefono mostrava titolo di default e nessuna copertina, e
// il PDF pubblicato rifletteva lo stato di QUALUNQUE dispositivo avesse premuto «Pubblica».
//
// Ora è un'unica riga in `user_settings.diary_config` (JSONB), letta e scritta da
// `app/api/diary-config/route.ts`. Questo file è condiviso da client e server: solo tipi e
// funzioni pure, nessun accesso a `localStorage` o a Supabase.

export interface DiaryStatsToggles {
  totali:    boolean
  record:    boolean
  medie:     boolean
  andamento: boolean
}

export interface DiaryReportExtras {
  mappa:       boolean
  statistiche: boolean
  grafico:     boolean
  cuore:       boolean
  velocita:    boolean
}

export interface DiaryConfig {
  title:    string
  subtitle: string
  author:   string
  /** URL su Supabase Storage. Mai più un data URL: vedi lib/diaryCoverUpload.ts. */
  coverUrl: string | null
  statsToggles: DiaryStatsToggles

  /** Impostazioni "per ogni percorso" applicate quando l'escursione non ha un proprio override. */
  reportExtrasDefault: DiaryReportExtras
  /** Override per singola escursione (chiave: activity_id), solo per i campi che differiscono dal
   *  default — così un default cambiato in seguito si propaga a tutte le escursioni che non sono
   *  mai state personalizzate, invece di restare congelate su un vecchio default copiato. */
  reportExtrasByActivity: Record<string, Partial<DiaryReportExtras>>

  /** Escursioni escluse dal libro (e quindi dal PDF pubblicato), per activity_id — vale sia per un
   *  resoconto narrato sia per un'escursione non ancora narrata (stub). */
  excludedActivityIds: string[]

  /** Mostra le escursioni non ancora narrate come pagine segnaposto. */
  showStubs: boolean
}

export const DEFAULT_DIARY_STATS_TOGGLES: DiaryStatsToggles = {
  totali: true, record: true, medie: true, andamento: true,
}

export const DEFAULT_DIARY_REPORT_EXTRAS: DiaryReportExtras = {
  mappa: true, statistiche: true, grafico: true, cuore: true, velocita: true,
}

export const DEFAULT_DIARY_CONFIG: DiaryConfig = {
  title: 'DIARIO di VIAGGIO',
  subtitle: 'I miei percorsi',
  author: '',
  coverUrl: null,
  statsToggles: DEFAULT_DIARY_STATS_TOGGLES,
  reportExtrasDefault: DEFAULT_DIARY_REPORT_EXTRAS,
  reportExtrasByActivity: {},
  excludedActivityIds: [],
  showStubs: true,
}

/**
 * Ricostruisce una configurazione valida da un valore grezzo (dal DB o dal client), campo per
 * campo — mai uno spread superficiale su `DEFAULT_DIARY_CONFIG`. Un record salvato prima
 * dell'aggiunta di un campo, o un JSON corrotto per un solo campo, deve cadere su quel singolo
 * default invece di far sparire l'intera configurazione.
 */
export function normalizeDiaryConfig(raw: unknown): DiaryConfig {
  const r = (raw && typeof raw === 'object') ? raw as Partial<DiaryConfig> : {}

  const statsToggles = (r.statsToggles && typeof r.statsToggles === 'object')
    ? { ...DEFAULT_DIARY_STATS_TOGGLES, ...r.statsToggles }
    : DEFAULT_DIARY_STATS_TOGGLES

  const reportExtrasDefault = (r.reportExtrasDefault && typeof r.reportExtrasDefault === 'object')
    ? { ...DEFAULT_DIARY_REPORT_EXTRAS, ...r.reportExtrasDefault }
    : DEFAULT_DIARY_REPORT_EXTRAS

  const reportExtrasByActivity: Record<string, Partial<DiaryReportExtras>> = {}
  if (r.reportExtrasByActivity && typeof r.reportExtrasByActivity === 'object') {
    for (const [activityId, patch] of Object.entries(r.reportExtrasByActivity)) {
      if (patch && typeof patch === 'object') reportExtrasByActivity[activityId] = patch as Partial<DiaryReportExtras>
    }
  }

  return {
    title:    typeof r.title    === 'string' ? r.title    : DEFAULT_DIARY_CONFIG.title,
    subtitle: typeof r.subtitle === 'string' ? r.subtitle : DEFAULT_DIARY_CONFIG.subtitle,
    author:   typeof r.author   === 'string' ? r.author   : DEFAULT_DIARY_CONFIG.author,
    coverUrl: typeof r.coverUrl === 'string' ? r.coverUrl : null,
    statsToggles,
    reportExtrasDefault,
    reportExtrasByActivity,
    excludedActivityIds: Array.isArray(r.excludedActivityIds)
      ? r.excludedActivityIds.filter((x): x is string => typeof x === 'string')
      : [],
    showStubs: typeof r.showStubs === 'boolean' ? r.showStubs : true,
  }
}

/** Le impostazioni "per ogni percorso" effettive per una specifica escursione: il default con
 *  sopra il suo eventuale override, campo per campo. */
export function resolveReportExtras(config: DiaryConfig, activityId: string): DiaryReportExtras {
  return { ...config.reportExtrasDefault, ...(config.reportExtrasByActivity[activityId] ?? {}) }
}

/** Le chiavi di `localStorage` usate dalla versione precedente, solo per la migrazione una tantum
 *  al primo caricamento (vedi app/diario/page.tsx). Da rimuovere insieme al codice di migrazione
 *  quando si potrà assumere che nessun utente attivo abbia più dati lì. */
export const LEGACY_LOCALSTORAGE_KEYS = {
  title: 'dtrek_diary_title',
  subtitle: 'dtrek_diary_subtitle',
  author: 'dtrek_diary_author',
  cover: 'dtrek_diary_cover',
  stats: 'dtrek_diary_stats',
  reportExtras: 'dtrek_diary_report_extras',
} as const
