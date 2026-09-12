import type { TrackPoint } from './tcxParser'
import { haversineM } from './geoUtils'

export interface MetricPoint { progress: number; value: number }

/** Stessa nozione di "avanzamento lungo la traccia" del libro privato
 *  (components/diario/chartUtils.ts trackPointsProgress), duplicata qui come funzione pura di
 *  lib/ perché il livello dati pubblico (lib/sharePublicDiary.ts) non deve dipendere da components/. */
function trackPointsProgress(trackPoints: TrackPoint[]): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < trackPoints.length; i++) {
    const p = trackPoints[i], q = trackPoints[i - 1]
    const d = (p.lat !== undefined && p.lon !== undefined && q.lat !== undefined && q.lon !== undefined)
      ? haversineM(q.lat, q.lon, p.lat, p.lon) : 0
    cum.push(cum[i - 1] + d)
  }
  const total = cum[cum.length - 1] || 1
  return cum.map(d => d / total)
}

/** Riduce la serie di un singolo campo (quota, battito, velocità) a al più `maxPts` punti,
 *  come lib/downsamplePolyline.ts fa per la traccia GPS — stesso principio, stesso motivo: il
 *  sito pubblico non ha bisogno della risoluzione grezza per disegnare un grafico leggibile. */
export function buildMetricSeries(
  trackPoints: TrackPoint[],
  field: 'altitudeMeters' | 'heartRateBpm' | 'speedMs',
  maxPts = 120,
): MetricPoint[] {
  if (trackPoints.length < 2) return []
  const progress = trackPointsProgress(trackPoints)
  const full = trackPoints
    .map((p, i) => (p[field] !== undefined ? { progress: progress[i], value: p[field] as number } : null))
    .filter((x): x is MetricPoint => x !== null)
  if (full.length <= maxPts) return full
  const step = (full.length - 1) / (maxPts - 1)
  return Array.from({ length: maxPts }, (_, i) => full[Math.min(Math.round(i * step), full.length - 1)])
}
