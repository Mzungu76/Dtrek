import type { PoiItem } from '@/lib/overpass'
import { computeCtsCore } from '@/lib/computeCtsForHike'
import { ctsLabel } from '@/lib/trailScore'
import type { CtsConfidence } from '@/lib/trailScore'
import { computeSafetyCore } from '@/lib/computeSafetyForHike'
import { computeTrailScoreV2 } from '@/lib/trailScoreV2'
import { estimateTimeMinutes } from '@/lib/trailStats'

// CTS di una tappa di un Cammino (docs/piano-cammini.md, Fase 5): la stessa pipeline dei percorsi
// (luoghi, pendenze, terreno, area protetta, preferenze) più lo storico dell'utente. Gira nel
// browser perché usa le sue impostazioni e le route /api/tei-*.

export interface TappaCts {
  ts: number
  label: string
  color: string
  confidence: CtsConfidence
  poisCount: number
  /** Sicurezza della tappa (fauna, cani da guardia, terreno, quota, tempo) e Trail Score aggregato CTS × cancello Sicurezza, come nel resto dell'app. */
  safety?: { overall: number; label: string; color: string }
  total?: number
}

export async function computeTappaCts(input: {
  points: [number, number, number][]
  distanceMeters: number
  gainM: number
  lossM: number
  maxM: number
  pois: PoiItem[]
  /** Tracciato di catalogo della tappa (per fauna e terreno) e minimo di quota, per la Sicurezza. */
  polyline?: [number, number][]
  minM?: number
  plannedDate?: string
}): Promise<TappaCts | null> {
  const now = new Date().toISOString()
  try {
    const core = await computeCtsCore(
      {
        trackPoints: input.points.map(([lat, lon, alt]) => ({ time: now, lat, lon, altitudeMeters: alt })),
        distanceMeters: input.distanceMeters,
        elevationGain: input.gainM,
        elevationLoss: input.lossM,
        altitudeMax: input.maxM,
        personalize: true,
      },
      { pois: input.pois },
    )
    if (!core) return null
    // La Sicurezza è best-effort (rete): senza, il CTS resta comunque mostrato.
    let safety: TappaCts['safety']
    try {
      const sc = await computeSafetyCore({
        routePolyline: input.polyline, distanceMeters: input.distanceMeters, elevationGain: input.gainM, elevationLoss: input.lossM,
        altitudeMax: input.maxM, altitudeMin: input.minM ?? 0, estimatedTimeSeconds: estimateTimeMinutes(input.distanceMeters / 1000, input.gainM) * 60,
        plannedDate: input.plannedDate,
      })
      safety = { overall: Math.round(sc.overall), label: sc.label, color: sc.color }
    } catch { /* senza Sicurezza il Trail Score aggregato non si calcola */ }
    const ts = Math.round(core.ts)
    const total = safety ? computeTrailScoreV2({ cts: ts, safety: safety.overall })?.score : undefined
    return { ts, ...ctsLabel(core.ts), confidence: core.confidence, poisCount: core.poisCount, safety, total: total != null ? Math.round(total) : undefined }
  } catch {
    return null
  }
}
