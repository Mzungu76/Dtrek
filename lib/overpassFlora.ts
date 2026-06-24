// Best-effort tree species / forest type lookup along a route, via Overpass
// `natural=wood`/`landuse=forest` polygons. OSM rarely tags individual tree
// species on forest areas (leaf_type/genus/species are uncommon), so this
// mostly reports the dominant leaf type (broadleaved/needleleaved/mixed) by
// area and surfaces any species/genus names actually present — it does not
// invent data when OSM has none.
import { fetchOverpass } from '@/lib/overpassTrails'
import type { FloraResult } from '@/lib/floraTypes'

interface OverpassWayEl {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
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

export async function fetchFloraAlongRoute(bbox: string): Promise<FloraResult> {
  const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`

  const query = `[out:json][timeout:20];
(
  way["natural"="wood"](${bboxStr});
  way["landuse"="forest"](${bboxStr});
)->.w;
.w out tags geom;`

  try {
    const data = await fetchOverpass<{ elements: OverpassWayEl[] }>(query)
    const ways = (data.elements ?? []).filter(e => e.type === 'way' && e.tags)

    if (ways.length === 0) {
      return { available: true, leafTypeDominant: null, speciesFound: [], forestCoveragePct: null }
    }

    let totalArea = 0
    const leafArea: Record<string, number> = { broadleaved: 0, needleleaved: 0, mixed: 0 }
    const species = new Set<string>()

    for (const way of ways) {
      const area = way.geometry?.length ? polygonAreaApprox(way.geometry) : 1
      totalArea += area

      const leafType = way.tags?.leaf_type
      if (leafType === 'broadleaved' || leafType === 'needleleaved' || leafType === 'mixed') {
        leafArea[leafType] += area
      }

      for (const key of ['species', 'genus', 'species:it', 'genus:it'] as const) {
        const v = way.tags?.[key]
        if (v) v.split(';').forEach(s => species.add(s.trim()))
      }
      const name = way.tags?.name
      if (name) species.add(name)
    }

    const leafTotal = leafArea.broadleaved + leafArea.needleleaved + leafArea.mixed
    let leafTypeDominant: FloraResult['leafTypeDominant'] = null
    if (leafTotal > 0) {
      leafTypeDominant = (Object.entries(leafArea).sort((a, b) => b[1] - a[1])[0][0]) as FloraResult['leafTypeDominant']
    }

    const bboxAreaApprox = haversineBboxAreaM2(minLat, minLon, maxLat, maxLon)
    const forestCoveragePct = bboxAreaApprox > 0 ? Math.min(100, Math.round((totalArea / bboxAreaApprox) * 100)) : null

    return {
      available: true,
      leafTypeDominant,
      speciesFound: Array.from(species).slice(0, 12),
      forestCoveragePct,
    }
  } catch {
    return { available: false, leafTypeDominant: null, speciesFound: [], forestCoveragePct: null }
  }
}

function haversineBboxAreaM2(minLat: number, minLon: number, maxLat: number, maxLon: number): number {
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
  return (maxLat - minLat) * mPerDegLat * (maxLon - minLon) * mPerDegLon
}
