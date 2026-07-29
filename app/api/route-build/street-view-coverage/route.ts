// Copertura Street View plausibile per un elenco di punti (POI) — vedi
// lib/routeBuilder/streetViewCoverage.ts. POST (non GET) perché l'elenco punti può essere lungo
// quanto la Galleria di una guida, oltre i limiti ragionevoli di una query string.
import { NextRequest, NextResponse } from 'next/server'
import { findLikelyStreetViewCoverage } from '@/lib/routeBuilder/streetViewCoverage'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

interface PointInput { lat?: unknown; lon?: unknown }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const raw: PointInput[] = Array.isArray(body?.points) ? body.points : []
  const points = raw
    .filter((p): p is { lat: number; lon: number } => typeof p.lat === 'number' && typeof p.lon === 'number')
    .slice(0, 60) // stesso ordine di grandezza della Galleria di una guida, mai un elenco arbitrario

  const covered = await findLikelyStreetViewCoverage(points).catch(() => points.map(() => false))
  return NextResponse.json({ covered })
}
