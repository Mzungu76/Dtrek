import type { DescriptionCredit } from '@/lib/placeSources'
import type { ActivityMeta } from '@/lib/blobStore'
import type { WeatherAtHike } from '@/lib/weather'
import type { MetaType, SiteType } from '@/lib/metaTypes'

export interface DiaryReport {
  /** Solo la voce unica di un cammino: le sue tappe percorse (nell'ordine di marcia) e quante ne ha il piano. */
  cammino?: { tappe: import('@/lib/cammini/diaryEntries').CamminoDiaryTappa[]; total: number }
  id: string
  activity_id: string
  title: string
  content: string
  created_at: string
  activity: {
    id: string; title: string; start_time: string
    distance_meters: number; total_time_seconds: number; elevation_gain: number
    weather_at_hike?: WeatherAtHike | null
    /** Tipologia della Meta (assente = 'sentiero') e luoghi visitati di un Borgo/Città — decidono
     *  quali cifre/parole mostra la pagina (lib/reportFacts.ts). */
    meta_type?: MetaType | null; site_type?: SiteType | null; borgo_stops?: unknown[] | null
    /** Solo Sito/Borgo: punto, immagine e descrizione del luogo (lib/siteInfoServer.ts). */
    site?: { point: { lat: number; lon: number } | null; cover: string | null; description: string | null; descriptionCredit?: DescriptionCredit | null } | null
  } | null
}

// Riesportati da lib/diaryConfig.ts, non ridefiniti qui: prima erano due interfacce identiche di
// struttura ma dichiarate in due file diversi — un candidato naturale a divergere silenziosamente
// (aggiungere un campo in una senza ricordarsi dell'altra).
export type { DiaryStatsToggles as StatsToggles, DiaryReportExtras as ReportExtras } from '@/lib/diaryConfig'

export type BookPage =
  | { kind: 'report'; startTime: string; report: DiaryReport }
  | { kind: 'stub'; startTime: string; activity: ActivityMeta }

// ── Accent color themes shared by StatCard / PillHeader / charts ──────────────

export type AccentTheme = { bg: string; border: string; text: string; iconBg: string; iconColor: string }

// DTREK-AUDIT.md P3 #36 — era la palette 'green' generica di Tailwind, non il brand DTrek (tailwind.config.ts
// 'forest'). Stessi passi 50/200/800/100/600 dello scale, solo sull'altra palette — nessuna variazione di
// contrasto testo/sfondo rispetto a prima, solo la tinta cambia.
export const GREEN:  AccentTheme = { bg: '#f1f8f2', border: '#bbe0bf', text: '#1c4724', iconBg: '#dcf0de', iconColor: '#277134' }
export const AMBER:  AccentTheme = { bg: '#fffbeb', border: '#fde68a', text: '#78350f', iconBg: '#fef3c7', iconColor: '#d97706' }
export const BLUE:   AccentTheme = { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', iconBg: '#dbeafe', iconColor: '#2563eb' }
export const VIOLET: AccentTheme = { bg: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95', iconBg: '#ede9fe', iconColor: '#7c3aed' }
