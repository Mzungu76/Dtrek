import type { PoiItem } from '@/lib/overpass'

// Luoghi di una tappa in ordine di cammino, con i chilometri progressivi dalla partenza
// (docs/piano-cammini.md, Fase 5): ogni luogo si aggancia al punto più vicino del profilo della tappa.
// Nel verso inverso la distanza si conta dall'altra estremità. Logica pura.

export interface PoiAlong {
  poi: PoiItem
  /** Chilometri dalla partenza della tappa, nel verso di marcia. */
  km: number
}

function d2(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = aLat - bLat
  const dLon = (aLon - bLon) * Math.cos((aLat * Math.PI) / 180)
  return dLat * dLat + dLon * dLon
}

export function poisAlongTappa(
  pois: PoiItem[],
  points: [number, number, number][],
  profile: [number, number][],
  reverse: boolean,
): PoiAlong[] {
  if (points.length === 0 || profile.length !== points.length) return []
  const totalM = profile[profile.length - 1][0]
  const out: PoiAlong[] = pois.map(poi => {
    let best = 0, bestD = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = d2(poi.lat, poi.lon, points[i][0], points[i][1])
      if (d < bestD) { bestD = d; best = i }
    }
    const m = reverse ? totalM - profile[best][0] : profile[best][0]
    return { poi, km: Math.round(m / 100) / 10 }
  })
  return out.sort((a, b) => a.km - b.km)
}
