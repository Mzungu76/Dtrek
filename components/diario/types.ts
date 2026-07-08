import type { ActivityMeta } from '@/lib/blobStore'
import type { WeatherAtHike } from '@/lib/openmeteo'

export interface DiaryReport {
  id: string
  activity_id: string
  title: string
  content: string
  created_at: string
  activity: {
    id: string; title: string; start_time: string
    distance_meters: number; total_time_seconds: number; elevation_gain: number
    weather_at_hike?: WeatherAtHike | null
  } | null
}

export interface StatsToggles {
  totali: boolean
  record:  boolean
  medie:   boolean
  andamento: boolean
}

export interface ReportExtras {
  mappa:       boolean
  statistiche: boolean
  grafico:     boolean
  cuore:       boolean
  velocita:    boolean
}

export type BookPage =
  | { kind: 'report'; startTime: string; report: DiaryReport }
  | { kind: 'stub'; startTime: string; activity: ActivityMeta }

// ── Accent color themes shared by StatCard / PillHeader / charts ──────────────

export type AccentTheme = { bg: string; border: string; text: string; iconBg: string; iconColor: string }

export const GREEN:  AccentTheme = { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', iconBg: '#dcfce7', iconColor: '#16a34a' }
export const AMBER:  AccentTheme = { bg: '#fffbeb', border: '#fde68a', text: '#78350f', iconBg: '#fef3c7', iconColor: '#d97706' }
export const BLUE:   AccentTheme = { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', iconBg: '#dbeafe', iconColor: '#2563eb' }
export const VIOLET: AccentTheme = { bg: '#f5f3ff', border: '#ddd6fe', text: '#4c1d95', iconBg: '#ede9fe', iconColor: '#7c3aed' }
