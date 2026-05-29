import { NextRequest, NextResponse } from 'next/server'

// Edge runtime: runs at CDN edge nodes (non-datacenter IPs) so Overpass
// doesn't block the request with "host_not_allowed" (blocks AWS/GCP datacenter IPs).
export const runtime = 'edge'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

export async function POST(req: NextRequest) {
  const body = await req.text()

  for (const endpoint of ENDPOINTS) {
    let upstream: Response
    try {
      upstream = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch {
      continue
    }

    if (!upstream.ok) continue

    const data = await upstream.json()
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'All Overpass endpoints unavailable' }, { status: 503 })
}
