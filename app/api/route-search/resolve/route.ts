import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { resolveGeometryFallback } from '@/lib/cl/computeCL'
import { enrichGeometryWithElevation } from '@/lib/dtm/elevationEnrich'
import { downsamplePolyline } from '@/lib/downsamplePolyline'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Chiamato solo per il SINGOLO candidato che l'utente ha scelto di importare (schermata di
// conferma import) — deliberatamente non fatto per ogni candidato nei risultati di
// app/api/route-search/route.ts, per non sprecare chiamate Overpass/DTM su percorsi che l'utente
// non sceglierà mai.
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let osmId: number
  try {
    const body = await req.json()
    osmId = Number(body.osmId)
    if (!Number.isFinite(osmId)) throw new Error('osmId mancante')
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const fallback = await resolveGeometryFallback(osmId)
  if (!fallback) return NextResponse.json({ ok: false, reason: 'geometry_not_found' })

  const enriched = await enrichGeometryWithElevation(fallback.geometry)
  if (!enriched) {
    // Traccia trovata ma senza copertura DTM per la quota — l'utente può comunque importare
    // con la sola geometria (mappa disponibile, profilo altimetrico no), come un import manuale.
    return NextResponse.json({
      ok: true,
      osmId,
      routePolyline: downsamplePolyline(fallback.geometry.map(([lat, lon]) => ({ time: '', lat, lon }))),
      trackPoints: [],
      distanceMeters: 0,
      elevationGain: 0,
      elevationLoss: 0,
      altitudeMax: 0,
      altitudeMin: 0,
      estimatedTimeSeconds: 0,
      hasElevation: false,
    })
  }

  return NextResponse.json({
    ok: true,
    osmId,
    routePolyline: downsamplePolyline(enriched.trackPoints),
    trackPoints: enriched.trackPoints,
    distanceMeters: enriched.distanceMeters,
    elevationGain: enriched.elevationGain,
    elevationLoss: enriched.elevationLoss,
    altitudeMax: enriched.altitudeMax,
    altitudeMin: enriched.altitudeMin,
    estimatedTimeSeconds: enriched.estimatedTimeSeconds,
    hasElevation: true,
  })
}
