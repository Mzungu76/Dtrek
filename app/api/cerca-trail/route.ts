export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lon = parseFloat(searchParams.get('lon') ?? '')
  const radius = Math.min(parseInt(searchParams.get('radius') ?? '20000'), 100_000)

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat/lon required' }, { status: 400 })
  }

  const query = `[out:json][timeout:30];
(
  relation["type"="route"]["route"="hiking"]["name"](around:${radius},${lat},${lon});
  relation["type"="route"]["route"="foot"]["name"](around:${radius},${lat},${lon});
);
out tags;`

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) continue
      return NextResponse.json(await res.json())
    } catch {
      continue
    }
  }

  return NextResponse.json({ error: 'Overpass non disponibile' }, { status: 502 })
}
