import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveGeometryFallback } from '@/lib/cl/computeCL'
import { enrichGeometryWithElevation } from '@/lib/dtm/elevationEnrich'
import { downloadAndParseGpx } from '@/lib/gpxSourceFetch'
import { downsamplePolyline } from '@/lib/downsamplePolyline'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Chiamato solo per il SINGOLO candidato che l'utente ha scelto di importare (schermata di
// conferma import) — deliberatamente non fatto per ogni candidato nei risultati di
// app/api/route-search/route.ts, per non sprecare chiamate Overpass/DTM/GPX su percorsi che
// l'utente non sceglierà mai. Non legge/scrive nessuna riga per-utente (solo Overpass, il DTM
// pubblico e — se presente — la pagina fonte stessa) — a differenza degli altri endpoint quindi
// basta un'identità "plausibile ma non verificabile" durante un blackout (stesso `degraded` di
// lib/supabaseAuth.ts) per proseguire comunque, non serve nemmeno la chiave AI di emergenza.
export async function POST(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let osmId: number | null
  let gpxUrl: string | null
  try {
    const body = await req.json()
    osmId = Number.isFinite(Number(body.osmId)) ? Number(body.osmId) : null
    gpxUrl = typeof body.gpxUrl === 'string' && body.gpxUrl ? body.gpxUrl : null
    if (osmId == null && !gpxUrl) throw new Error('né osmId né gpxUrl presenti')
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  // La traccia scaricata dalla fonte ha priorità: è quella esatta pubblicata dalla pagina che
  // Giulia ha citato, non un'approssimazione per nome — vedi lib/gpxSourceFetch.ts.
  if (gpxUrl) {
    const gpx = await downloadAndParseGpx(gpxUrl)
    if (gpx) {
      return NextResponse.json({
        ok: true,
        osmId,
        source: 'gpx',
        routePolyline: downsamplePolyline(gpx.trackPoints),
        trackPoints: gpx.trackPoints,
        distanceMeters: gpx.distanceMeters,
        elevationGain: gpx.elevationGain,
        elevationLoss: gpx.elevationLoss,
        altitudeMax: gpx.altitudeMax,
        altitudeMin: gpx.altitudeMin,
        estimatedTimeSeconds: gpx.estimatedTimeSeconds,
        hasElevation: true,
      })
    }
    // Il download/parsing del GPX è fallito (link non più valido, formato inatteso...) — se c'è
    // comunque un match Overpass prosegue con quello sotto, altrimenti nessuna traccia disponibile.
    if (osmId == null) return NextResponse.json({ ok: false, reason: 'gpx_download_failed' })
  }

  const fallback = await resolveGeometryFallback(osmId!)
  if (!fallback) return NextResponse.json({ ok: false, reason: 'geometry_not_found' })

  const enriched = await enrichGeometryWithElevation(fallback.geometry)
  if (!enriched) {
    // Traccia trovata ma senza copertura DTM per la quota — l'utente può comunque importare
    // con la sola geometria (mappa disponibile, profilo altimetrico no), come un import manuale.
    return NextResponse.json({
      ok: true,
      osmId,
      source: 'osm',
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
    source: 'osm',
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
