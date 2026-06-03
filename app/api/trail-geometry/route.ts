export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id numerico richiesto' }, { status: 400 })
  }

  // Fetch all way members of the relation with their node geometry
  const query = `[out:json][timeout:15];relation(${id});way(r);out geom;`

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(16_000),
      })
      if (!res.ok) continue

      const json = await res.json() as {
        elements: Array<{ geometry?: Array<{ lat: number; lon: number }> }>
      }

      // Collect all coordinates from all ways in relation order
      const polyline: [number, number][] = []
      for (const way of json.elements ?? []) {
        if (!way.geometry?.length) continue
        for (const pt of way.geometry) {
          polyline.push([pt.lat, pt.lon])
        }
      }

      return NextResponse.json({ polyline })
    } catch {
      continue
    }
  }

  return NextResponse.json({ error: 'Overpass non disponibile', polyline: [] }, { status: 502 })
}
