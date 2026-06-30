import { ActivityMeta } from './blobStore'
import { Streaks, difficultyIndex } from './stats'

export type BadgeCategory = 'distanza' | 'dislivello' | 'quota' | 'frequenza' | 'speciale'

export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  category: BadgeCategory
  check: (activities: ActivityMeta[], streaks: Streaks) => boolean
  progress?: (activities: ActivityMeta[], streaks: Streaks) => { current: number; target: number; unit: string }
}

const totalKm       = (acts: ActivityMeta[]) => acts.reduce((s, a) => s + a.distanceMeters / 1000, 0)
const totalGainM    = (acts: ActivityMeta[]) => acts.reduce((s, a) => s + (a.elevationGain ?? 0), 0)
const maxAltM       = (acts: ActivityMeta[]) => Math.max(0, ...acts.map(a => a.altitudeMax ?? 0))
const maxSingleGain = (acts: ActivityMeta[]) => Math.max(0, ...acts.map(a => a.elevationGain ?? 0))

export const ALL_BADGES: Badge[] = [
  // ── Distanza ──
  {
    id: 'km_50', name: 'Explorer', description: '50 km totali percorsi',
    icon: '🗺️', category: 'distanza',
    check: (acts) => totalKm(acts) >= 50,
    progress: (acts) => ({ current: Math.round(totalKm(acts)), target: 50, unit: 'km' }),
  },
  {
    id: 'km_100', name: 'Centurione', description: '100 km totali percorsi',
    icon: '🏅', category: 'distanza',
    check: (acts) => totalKm(acts) >= 100,
    progress: (acts) => ({ current: Math.round(totalKm(acts)), target: 100, unit: 'km' }),
  },
  {
    id: 'km_500', name: '500km Camminatore', description: '500 km totali percorsi',
    icon: '🥾', category: 'distanza',
    check: (acts) => totalKm(acts) >= 500,
    progress: (acts) => ({ current: Math.round(totalKm(acts)), target: 500, unit: 'km' }),
  },
  {
    id: 'km_1000', name: 'Mille Miglia', description: '1000 km totali percorsi',
    icon: '🌍', category: 'distanza',
    check: (acts) => totalKm(acts) >= 1000,
    progress: (acts) => ({ current: Math.round(totalKm(acts)), target: 1000, unit: 'km' }),
  },
  {
    id: 'single_20', name: 'Maratoneta', description: 'Escursione singola da 20+ km',
    icon: '🔥', category: 'distanza',
    check: (acts) => acts.some(a => a.distanceMeters >= 20000),
  },
  // ── Dislivello ──
  {
    id: 'gain_1000', name: 'Scalatore', description: '1000m D+ in una singola escursione',
    icon: '⛰️', category: 'dislivello',
    check: (acts) => maxSingleGain(acts) >= 1000,
    progress: (acts) => ({ current: Math.round(maxSingleGain(acts)), target: 1000, unit: 'm' }),
  },
  {
    id: 'gain_2000', name: 'Gran Salita', description: '2000m D+ in una singola escursione',
    icon: '🗻', category: 'dislivello',
    check: (acts) => maxSingleGain(acts) >= 2000,
    progress: (acts) => ({ current: Math.round(maxSingleGain(acts)), target: 2000, unit: 'm' }),
  },
  {
    id: 'gain_5000_total', name: '5000m D+ Totali', description: '5000m di dislivello cumulativo',
    icon: '🏔️', category: 'dislivello',
    check: (acts) => totalGainM(acts) >= 5000,
    progress: (acts) => ({ current: Math.round(totalGainM(acts)), target: 5000, unit: 'm' }),
  },
  {
    id: 'gain_50000_total', name: 'Himalaya Virtuale', description: '50.000m D+ cumulativi — equivale all\'Himalaya dal mare',
    icon: '🌐', category: 'dislivello',
    check: (acts) => totalGainM(acts) >= 50000,
    progress: (acts) => ({ current: Math.round(totalGainM(acts)), target: 50000, unit: 'm' }),
  },
  // ── Quota ──
  {
    id: 'alt_2000', name: 'Sopra le Nuvole', description: 'Quota massima ≥ 2000 m slm',
    icon: '☁️', category: 'quota',
    check: (acts) => maxAltM(acts) >= 2000,
    progress: (acts) => ({ current: Math.round(maxAltM(acts)), target: 2000, unit: 'm' }),
  },
  {
    id: 'alt_3000', name: '3000m Conquistato', description: 'Quota massima ≥ 3000 m slm',
    icon: '🌨️', category: 'quota',
    check: (acts) => maxAltM(acts) >= 3000,
    progress: (acts) => ({ current: Math.round(maxAltM(acts)), target: 3000, unit: 'm' }),
  },
  {
    id: 'alt_4000', name: 'Quattromila', description: 'Quota massima ≥ 4000 m slm',
    icon: '🏔️', category: 'quota',
    check: (acts) => maxAltM(acts) >= 4000,
    progress: (acts) => ({ current: Math.round(maxAltM(acts)), target: 4000, unit: 'm' }),
  },
  // ── Frequenza ──
  {
    id: 'count_10', name: '10 Avventure', description: '10 escursioni completate',
    icon: '🎒', category: 'frequenza',
    check: (acts) => acts.length >= 10,
    progress: (acts) => ({ current: acts.length, target: 10, unit: '' }),
  },
  {
    id: 'count_50', name: '50 Avventure', description: '50 escursioni completate',
    icon: '🌟', category: 'frequenza',
    check: (acts) => acts.length >= 50,
    progress: (acts) => ({ current: acts.length, target: 50, unit: '' }),
  },
  {
    id: 'count_100', name: 'Centenario', description: '100 escursioni completate',
    icon: '💯', category: 'frequenza',
    check: (acts) => acts.length >= 100,
    progress: (acts) => ({ current: acts.length, target: 100, unit: '' }),
  },
  {
    id: 'streak_4w', name: 'Abitudinario', description: '4 settimane consecutive con almeno un\'escursione',
    icon: '🔥', category: 'frequenza',
    check: (_, streaks) => streaks.longestWeeks >= 4,
    progress: (_, streaks) => ({ current: streaks.longestWeeks, target: 4, unit: 'sett.' }),
  },
  {
    id: 'streak_8w', name: 'Bimestrale', description: '8 settimane consecutive con almeno un\'escursione',
    icon: '⚡', category: 'frequenza',
    check: (_, streaks) => streaks.longestWeeks >= 8,
    progress: (_, streaks) => ({ current: streaks.longestWeeks, target: 8, unit: 'sett.' }),
  },
  {
    id: 'streak_26w', name: 'Semestrale', description: '26 settimane consecutive — 6 mesi no-stop',
    icon: '🏆', category: 'frequenza',
    check: (_, streaks) => streaks.longestWeeks >= 26,
    progress: (_, streaks) => ({ current: streaks.longestWeeks, target: 26, unit: 'sett.' }),
  },
  // ── Speciale ──
  {
    id: 'rating_10', name: 'Percorso Perfetto', description: 'Un\'escursione con voto 10',
    icon: '⭐', category: 'speciale',
    check: (acts) => acts.some(a => a.userRating === 10),
  },
  {
    id: 'satisfaction_10', name: 'Soddisfazione Totale', description: 'Soddisfazione 10/10 in un\'escursione',
    icon: '😍', category: 'speciale',
    check: (acts) => acts.some(a => a.soddisfazione === 10),
  },
  {
    id: 'trail_s', name: 'Connoisseur', description: 'Un percorso con Trail Score ≥ 85',
    icon: '🌿', category: 'speciale',
    check: (acts) => acts.some(a => (a.trailScore ?? 0) >= 85),
  },
  {
    id: 'difficult_50', name: 'Ripido', description: 'Indice difficoltà ≥ 50 m/km in un\'escursione',
    icon: '📐', category: 'speciale',
    check: (acts) => acts.some(a => difficultyIndex(a.elevationGain, a.distanceMeters) >= 50),
  },
]

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  distanza:  'Distanza',
  dislivello: 'Dislivello',
  quota:     'Quota',
  frequenza: 'Frequenza',
  speciale:  'Speciale',
}

export interface ComputedBadge extends Badge {
  unlocked: boolean
  progressCurrent?: number
  progressTarget?: number
  progressUnit?: string
  progressPct?: number
}

export function computeBadges(activities: ActivityMeta[], streaks: Streaks): ComputedBadge[] {
  return ALL_BADGES.map(badge => {
    const unlocked = badge.check(activities, streaks)
    const prog = badge.progress?.(activities, streaks)
    return {
      ...badge,
      unlocked,
      progressCurrent: prog?.current,
      progressTarget: prog?.target,
      progressUnit: prog?.unit,
      progressPct: prog ? Math.min(100, Math.round(prog.current / prog.target * 100)) : undefined,
    }
  })
}

// Badge id chains ordered from lowest to highest tier — only the highest
// unlocked tier in each chain represents the user's "current" achievement
// (e.g. unlocking "Centurione" supersedes "Explorer").
const BADGE_CHAINS: string[][] = [
  ['km_50', 'km_100', 'km_500', 'km_1000'],
  ['gain_1000', 'gain_2000'],
  ['gain_5000_total', 'gain_50000_total'],
  ['alt_2000', 'alt_3000', 'alt_4000'],
  ['count_10', 'count_50', 'count_100'],
  ['streak_4w', 'streak_8w', 'streak_26w'],
]

/**
 * Unlocked badges representing the user's current state: for each chain of
 * progressive badges (e.g. km_50 → km_100 → km_500), only the highest tier
 * reached is included; standalone (non-chained) unlocked badges pass through.
 */
export function computeCurrentBadges(activities: ActivityMeta[], streaks: Streaks): ComputedBadge[] {
  const all = computeBadges(activities, streaks)
  const unlocked = all.filter(b => b.unlocked)
  const byId = new Map(unlocked.map(b => [b.id, b]))
  const chained = new Set(BADGE_CHAINS.flat())

  const result: ComputedBadge[] = []
  for (const chain of BADGE_CHAINS) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const b = byId.get(chain[i])
      if (b) { result.push(b); break }
    }
  }
  for (const b of unlocked) {
    if (!chained.has(b.id)) result.push(b)
  }
  return result
}
