import type { ActivityMeta, computeGlobalStats } from '@/lib/blobStore'
import type { Streaks } from '@/lib/stats'
import type { ComputedBadge } from '@/lib/badges'
import type { DailyLoad, FormStatus } from '@/lib/trainingLoad'
import type { RecoveryInfo } from '@/lib/bioMetrics'
import type { DiarySummary } from '@/app/api/diaries/route'
import type { CollectionSummary } from '@/app/api/collections/route'

export interface NextOuting {
  id: string
  title: string
  plannedDate: string
  distanceMeters: number
  elevationGain: number
  /** Assente finché non risolto, null se non disponibile (niente lat/lon sulla Meta, o la
   *  chiamata a Open-Meteo è fallita) — un widget non deve inventare un meteo che non ha. */
  weather?: { tempMax: number; tempMin: number; weathercode: number } | null
}

/** Tutto ciò che i widget della Bacheca-dashboard possono aver bisogno di leggere — calcolato una
 *  sola volta nella pagina (stessa logica già in uso prima di questo restyling) e passato per
 *  riferimento, così più widget sulla stessa scheda non ricalcolano/rifetchano la stessa cosa. */
export interface DashboardData {
  activities: ActivityMeta[]
  hasEnoughHistory: boolean
  lowHistoryNote: string

  streaks: Streaks
  badges: ComputedBadge[]
  nearestBadge: ComputedBadge | null
  badgeIsClose: boolean

  globalStats: ReturnType<typeof computeGlobalStats>

  trainingLoadData: DailyLoad[]
  recovery: RecoveryInfo
  forma: FormStatus
  recoveryPhrase: string
  formaPhrase: string

  weeklyVolume: { week: string; km: number }[]
  currentWeekKm: number
  volumePhrase: string | null

  streakPhrase: string

  nextOuting: NextOuting | null
  nextOutingLoading: boolean

  defaultDiary: DiarySummary | null
  publishedCollections: CollectionSummary[]

  percorsiPerTe: { status: 'loading' | 'ok' | 'empty_no_location' | 'error'; count: number }
}
