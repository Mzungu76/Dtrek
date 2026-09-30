// Calcoli puri per i widget della Bacheca (statistiche, obiettivi, anniversari). Nessun React/DOM,
// nessuna rete: partono solo da ActivityMeta, così sono testabili e restano validi offline.
import type { ActivityMeta } from '@/lib/blobStore'

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(a: ActivityMeta): Date | null {
  const d = new Date(a.startTime)
  return Number.isNaN(d.getTime()) ? null : d
}

function km(a: ActivityMeta): number { return a.distanceMeters / 1000 }

/** Lunedì 00:00 (ora locale) della settimana che contiene `d`. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (out.getDay() + 6) % 7 // lunedì = 0
  out.setDate(out.getDate() - dow)
  return out
}

export interface PeriodTotals { count: number; km: number; elevation: number }

export function totalsBetween(activities: ActivityMeta[], from: Date, toExclusive: Date): PeriodTotals {
  let count = 0, dist = 0, elev = 0
  for (const a of activities) {
    const d = toDate(a)
    if (!d || d < from || d >= toExclusive) continue
    count++; dist += km(a); elev += a.elevationGain
  }
  return { count, km: dist, elevation: elev }
}

/** Questa settimana (da lunedì) contro la stessa finestra della settimana scorsa — a parità di giorni
 *  trascorsi, così il confronto a metà settimana non è sempre "in calo". */
export function weekOverWeek(activities: ActivityMeta[], now: Date): { thisWeek: PeriodTotals; lastWeek: PeriodTotals } {
  const start = startOfWeek(now)
  const prevStart = new Date(start.getTime() - 7 * DAY_MS)
  const elapsed = now.getTime() - start.getTime()
  return {
    thisWeek: totalsBetween(activities, start, new Date(now.getTime() + 1)),
    lastWeek: totalsBetween(activities, prevStart, new Date(prevStart.getTime() + elapsed + 1)),
  }
}

export interface YearProgress {
  doneKm: number
  doneElevation: number
  /** Proiezione lineare a fine anno sul ritmo dell'anno finora; null nelle prime settimane. */
  projectedKm: number | null
  dayOfYear: number
  daysInYear: number
}

export function yearProgress(activities: ActivityMeta[], now: Date): YearProgress {
  const from = new Date(now.getFullYear(), 0, 1)
  const to = new Date(now.getFullYear() + 1, 0, 1)
  const t = totalsBetween(activities, from, to)
  const dayOfYear = Math.floor((now.getTime() - from.getTime()) / DAY_MS) + 1
  const daysInYear = Math.round((to.getTime() - from.getTime()) / DAY_MS)
  return {
    doneKm: t.km,
    doneElevation: t.elevation,
    projectedKm: dayOfYear >= 21 ? (t.km / dayOfYear) * daysInYear : null,
    dayOfYear,
    daysInYear,
  }
}

export interface MonthChallenge { target: number; done: number; monthLabelIndex: number }

/** Sfida del mese: una uscita in più rispetto alla media mensile dello storico (almeno 2). */
export function monthChallenge(activities: ActivityMeta[], now: Date): MonthChallenge {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const done = totalsBetween(activities, monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1)).count
  const past = activities.filter((a) => { const d = toDate(a); return d && d < monthStart })
  const monthsWithData = new Set(past.map((a) => { const d = toDate(a)!; return `${d.getFullYear()}-${d.getMonth()}` })).size
  const avg = monthsWithData > 0 ? past.length / monthsWithData : 0
  return { target: Math.max(2, Math.round(avg) + 1), done, monthLabelIndex: now.getMonth() }
}

export function yearRecords(activities: ActivityMeta[], year: number): { longest: ActivityMeta | null; mostElevation: ActivityMeta | null; highest: ActivityMeta | null } {
  const inYear = activities.filter((a) => toDate(a)?.getFullYear() === year)
  const best = (score: (a: ActivityMeta) => number) => inYear.reduce<ActivityMeta | null>((b, a) => (b == null || score(a) > score(b) ? a : b), null)
  return { longest: best((a) => a.distanceMeters), mostElevation: best((a) => a.elevationGain), highest: best((a) => a.altitudeMax) }
}

/** Le uscite più alte di sempre (quota massima), senza contare quelle senza altimetria. */
export function topAltitudes(activities: ActivityMeta[], n = 5): ActivityMeta[] {
  return activities.filter((a) => a.altitudeMax > 0).sort((a, b) => b.altitudeMax - a.altitudeMax).slice(0, n)
}

/** Uscite fatte nello stesso periodo dell'anno (±window giorni) in anni precedenti. */
export function anniversaries(activities: ActivityMeta[], now: Date, windowDays = 3): { activity: ActivityMeta; yearsAgo: number }[] {
  const out: { activity: ActivityMeta; yearsAgo: number }[] = []
  for (const a of activities) {
    const d = toDate(a)
    if (!d) continue
    const yearsAgo = now.getFullYear() - d.getFullYear()
    if (yearsAgo < 1) continue
    const sameDay = new Date(now.getFullYear(), d.getMonth(), d.getDate())
    const diff = Math.abs(sameDay.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / DAY_MS
    if (diff <= windowDays) out.push({ activity: a, yearsAgo })
  }
  return out.sort((x, y) => x.yearsAgo - y.yearsAgo)
}

export const DISTANCE_BUCKETS = [
  { label: 'Corte', hint: 'sotto 8 km', max: 8 },
  { label: 'Medie', hint: '8-15 km', max: 15 },
  { label: 'Lunghe', hint: 'oltre 15 km', max: Infinity },
] as const

export function distanceDistribution(activities: ActivityMeta[]): number[] {
  const counts = DISTANCE_BUCKETS.map(() => 0)
  for (const a of activities) {
    const k = km(a)
    const i = DISTANCE_BUCKETS.findIndex((b) => k < b.max)
    counts[i === -1 ? counts.length - 1 : i]++
  }
  return counts
}

/** Uscite per giorno della settimana, da lunedì (0) a domenica (6). */
export function weekdayCounts(activities: ActivityMeta[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const a of activities) { const d = toDate(a); if (d) counts[(d.getDay() + 6) % 7]++ }
  return counts
}

export const START_HOUR_BUCKETS = ['Prima delle 8', '8-10', '10-12', 'Dopo le 12'] as const

export function startHourDistribution(activities: ActivityMeta[]): number[] {
  const counts = [0, 0, 0, 0]
  for (const a of activities) {
    const d = toDate(a)
    if (!d) continue
    const h = d.getHours()
    counts[h < 8 ? 0 : h < 10 ? 1 : h < 12 ? 2 : 3]++
  }
  return counts
}

/** Chilometri cumulati a fine di ciascuno degli ultimi `months` mesi (per la linea del totale). */
export function cumulativeKmByMonth(activities: ActivityMeta[], now: Date, months = 12): { label: string; km: number }[] {
  const out: { label: string; km: number }[] = []
  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const label = new Date(end.getFullYear(), end.getMonth() - 1, 1).toLocaleDateString('it-IT', { month: 'short' })
    const total = activities.reduce((s, a) => { const d = toDate(a); return d && d < end ? s + km(a) : s }, 0)
    out.push({ label, km: Math.round(total) })
  }
  return out
}

/** Mese (0-11) con più uscite di sempre e quante; null senza storico. */
export function busiestMonth(activities: ActivityMeta[]): { month: number; count: number; km: number } | null {
  const byMonth = Array.from({ length: 12 }, () => ({ count: 0, km: 0 }))
  for (const a of activities) { const d = toDate(a); if (d) { byMonth[d.getMonth()].count++; byMonth[d.getMonth()].km += km(a) } }
  let best = -1
  byMonth.forEach((m, i) => { if (m.count > 0 && (best === -1 || m.count > byMonth[best].count)) best = i })
  return best === -1 ? null : { month: best, ...byMonth[best] }
}

/** Dislivello delle ultime `n` uscite, in ordine cronologico. */
export function recentElevations(activities: ActivityMeta[], n = 12): { title: string; elevation: number }[] {
  return [...activities]
    .filter((a) => toDate(a))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(-n)
    .map((a) => ({ title: a.title, elevation: Math.round(a.elevationGain) }))
}
