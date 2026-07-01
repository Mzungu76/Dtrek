export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'

/** Driving distance/duration via OSRM public demo server (free, no API key). */
export async function GET(req: NextRequest) {
  const fromLat = req.nextUrl.searchParams.get('fromLat')
  const fromLon = req.nextUrl.searchParams.get('fromLon')
  const toLat   = req.nextUrl.searchParams.get('toLat')
  const toLon   = req.nextUrl.searchParams.get('toLon')

  if (!fromLat || !fromLon || !toLat || !toLon) {
    return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return NextResponse.json({ error: 'Routing non disponibile' }, { status: 502 })
    const data = await res.json()
    const route = data?.routes?.[0]
    if (!route) return NextResponse.json({ error: 'Nessun percorso trovato' }, { status: 404 })
    return NextResponse.json({
      distanceMeters: route.distance as number,
      durationSeconds: route.duration as number,
    })
  } catch {
    return NextResponse.json({ error: 'Routing non disponibile' }, { status: 502 })
  }
}
