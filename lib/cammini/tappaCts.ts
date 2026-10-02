import type { PoiItem } from '@/lib/overpass'
import { computeCtsCore } from '@/lib/computeCtsForHike'
import { ctsLabel } from '@/lib/trailScore'
import type { CtsConfidence } from '@/lib/trailScore'

// CTS di una tappa di un Cammino (docs/piano-cammini.md, Fase 5): la stessa pipeline dei percorsi
// (luoghi, pendenze, terreno, area protetta, preferenze) più lo storico dell'utente. Gira nel
// browser perché usa le sue impostazioni e le route /api/tei-*.

export interface TappaCts {
  ts: number
  label: string
  color: string
  confidence: CtsConfidence
  poisCount: number
}

export async function computeTappaCts(input: {
  points: [number, number, number][]
  distanceMeters: number
  gainM: number
  lossM: number
  maxM: number
  pois: PoiItem[]
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
    return { ts: Math.round(core.ts), ...ctsLabel(core.ts), confidence: core.confidence, poisCount: core.poisCount }
  } catch {
    return null
  }
}
