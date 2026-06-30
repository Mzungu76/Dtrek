// Best-effort estimate of livestock-guardian-dog risk (cani da pastore
// maremmano-abruzzese a guardia di greggi) along a route, via Overpass
// pasture/sheepfold tags. OSM tagging for sheep grazing is inconsistent, so
// this is a coarse heuristic (coverage % of pasture-like land near the
// track), not a precise sighting feed.
import { fetchOverpass } from '@/lib/overpassTrails'

export interface GuardianDogRisk {
  available: boolean
  present: boolean
  coveragePct: number | null
}

interface OverpassWayEl {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

interface OverpassNodeEl {
  type: 'node'
  id: number
  tags?: Record<string, string>
}

function polygonAreaApprox(geometry: Array<{ lat: number; lon: number }>): number {
  if (geometry.length < 3) return 0
  const lat0 = geometry[0].lat
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos(lat0 * Math.PI / 180)
  let area = 0
  for (let i = 0; i < geometry.length; i++) {
    const a = geometry[i]
    const b = geometry[(i + 1) % geometry.length]
    const ax = a.lon * mPerDegLon, ay = a.lat * mPerDegLat
    const bx = b.lon * mPerDegLon, by = b.lat * mPerDegLat
    area += ax * by - bx * ay
  }
  return Math.abs(area) / 2
}

function haversineBboxAreaM2(minLat: number, minLon: number, maxLat: number, maxLon: number): number {
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
  return (maxLat - minLat) * mPerDegLat * (maxLon - minLon) * mPerDegLon
}

/** bbox as "minLat,minLon,maxLat,maxLon" */
export async function fetchGuardianDogRiskAlongRoute(bbox: string): Promise<GuardianDogRisk> {
  const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`

  const query = `[out:json][timeout:20];
(
  way["landuse"="meadow"]["animal"="sheep"](${bboxStr});
  way["landuse"="farmland"]["produce"="wool"](${bboxStr});
  way["landuse"="pasture"](${bboxStr});
  way["agricultural"="sheep_pasture"](${bboxStr});
  node["building"="sheepfold"](${bboxStr});
  node["building"="farm_auxiliary"]["produce"="wool"](${bboxStr});
  way["building"="sheepfold"](${bboxStr});
)->.x;
.x out tags geom;`

  try {
    const data = await fetchOverpass<{ elements: (OverpassWayEl | OverpassNodeEl)[] }>(query)
    const elements = data.elements ?? []
    const ways = elements.filter((e): e is OverpassWayEl => e.type === 'way' && !!e.tags)
    const nodes = elements.filter((e): e is OverpassNodeEl => e.type === 'node' && !!e.tags)

    if (ways.length === 0 && nodes.length === 0) {
      return { available: true, present: false, coveragePct: 0 }
    }

    let pastureArea = 0
    for (const way of ways) {
      pastureArea += way.geometry?.length ? polygonAreaApprox(way.geometry) : 0
    }

    const bboxAreaApprox = haversineBboxAreaM2(minLat, minLon, maxLat, maxLon)
    const coveragePct = bboxAreaApprox > 0 ? Math.min(100, Math.round((pastureArea / bboxAreaApprox) * 100)) : null

    // Sheepfolds/farm buildings are a direct signal even with negligible mapped pasture area.
    const present = nodes.length > 0 || (coveragePct !== null && coveragePct >= 2)

    return { available: true, present, coveragePct }
  } catch {
    return { available: false, present: false, coveragePct: null }
  }
}
