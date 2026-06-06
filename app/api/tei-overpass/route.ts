import { NextRequest, NextResponse } from 'next/server'
import type { OsmTeiData, OsmElement } from '@/lib/tei'

export const dynamic = 'force-dynamic'

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCenter(el: any): { lat: number; lon: number } | null {
  if (el.type === 'node') return { lat: el.lat, lon: el.lon }
  if (el.center) return { lat: el.center.lat, lon: el.center.lon }
  return null
}

function sampleGeom(
  geom: Array<{ lat: number; lon: number }>,
  maxPts = 30,
): Array<{ lat: number; lon: number }> {
  if (geom.length <= maxPts) return geom
  const step = Math.ceil(geom.length / maxPts)
  return geom.filter((_, i) => i % step === 0)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseOsmTei(elements: any[]): OsmTeiData {
  const waterways:    OsmElement[] = []
  const highways:     OsmElement[] = []
  const antrHighways: OsmElement[] = []
  const powerLines:   OsmElement[] = []
  const waterShore:   OsmElement[] = []

  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {}

    // Water area ways (lakes, ponds) — geometry is the shoreline polygon
    if (tags.natural === 'water' && el.geometry && Array.isArray(el.geometry)) {
      for (const pt of sampleGeom(el.geometry)) {
        if (!isNaN(pt.lat) && !isNaN(pt.lon)) {
          waterShore.push({ lat: pt.lat, lon: pt.lon, tags })
        }
      }
      continue
    }

    // Water area relations (large lakes like Bolsena) — member ways carry the geometry
    if (tags.natural === 'water' && el.members && Array.isArray(el.members)) {
      let processed = 0
      for (const member of el.members) {
        if (processed >= 6) break  // cap members to limit data volume
        if (member.geometry && Array.isArray(member.geometry)) {
          for (const pt of sampleGeom(member.geometry, 20)) {
            if (!isNaN(pt.lat) && !isNaN(pt.lon)) {
              waterShore.push({ lat: pt.lat, lon: pt.lon, tags })
            }
          }
          processed++
        }
      }
      continue
    }

    const center = extractCenter(el)
    if (!center) continue
    const { lat, lon } = center
    if (isNaN(lat) || isNaN(lon)) continue

    const element: OsmElement = { lat, lon, tags }

    const waterway = tags.waterway
    if (waterway && ['river', 'stream', 'canal', 'drain', 'brook', 'ditch'].includes(waterway)) {
      waterways.push(element)
      continue
    }

    const power = tags.power
    if (power === 'line') {
      powerLines.push(element)
      continue
    }

    const highway = tags.highway
    if (!highway) continue

    if (['primary', 'secondary', 'tertiary', 'trunk', 'motorway'].includes(highway)) {
      antrHighways.push(element)
      continue
    }

    if (['footway', 'path', 'track', 'bridleway', 'steps', 'cycleway', 'unclassified', 'residential', 'service'].includes(highway)) {
      highways.push(element)
    }
  }

  return { waterways, highways, antrHighways, powerLines, waterShore }
}

export async function GET(req: NextRequest) {
  try {
    const bbox = req.nextUrl.searchParams.get('bbox')
    if (!bbox || bbox.split(',').length !== 4) {
      return NextResponse.json({ error: 'bbox required (s,w,n,e)' }, { status: 400 })
    }

    const [s, w, n, e] = bbox.split(',')

    const query = `
[out:json][timeout:30];
(
  way["waterway"~"^(river|stream|canal|drain|brook|ditch)$"](${s},${w},${n},${e});
  way["highway"]["surface"](${s},${w},${n},${e});
  way["highway"~"^(primary|secondary|tertiary|trunk|motorway)$"](${s},${w},${n},${e});
  way["power"="line"](${s},${w},${n},${e});
);
out center;
(
  way["natural"="water"](${s},${w},${n},${e});
  relation["natural"="water"](${s},${w},${n},${e});
);
out geom;`

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(30000),
        })
        if (!res.ok) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: { elements: any[] } = await res.json()
        return NextResponse.json(parseOsmTei(data.elements ?? []))
      } catch {
        continue
      }
    }

    // Return empty data if all endpoints fail — TEI still works without OSM data
    const empty: OsmTeiData = { waterways: [], highways: [], antrHighways: [], powerLines: [] }
    return NextResponse.json(empty)
  } catch (e) {
    console.error('GET /api/tei-overpass:', e)
    const empty: OsmTeiData = { waterways: [], highways: [], antrHighways: [], powerLines: [] }
    return NextResponse.json(empty)
  }
}
