import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { padBbox } from '@/lib/overpassTrails'
import { fetchWalkNetwork, nearestGraphNode } from '@/lib/routeBuilder/osmGraph'
import { generateLoopCandidates, generateOutAndBackCandidates, type RouteType } from '@/lib/routeBuilder/loopBuilder'
import { scoreAndEnrichCandidates } from '@/lib/routeBuilder/scoreCandidates'
import { fetchHikerProfile, fetchActivitySummary } from '@/lib/hikerContext'
import { sanitizeHikerConcerns, sanitizeHikerEnvironmentPrefs } from '@/lib/hikerProfile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_TARGET_DISTANCE_KM = 1
const MAX_TARGET_DISTANCE_KM = 20
// Un punto di partenza a più di questa distanza da qualunque nodo della rete percorribile non ha
// abbastanza rete nei dintorni per costruire un percorso — meglio un errore chiaro che un anello
// costruito su un frammento isolato di strada.
const START_SNAP_THRESHOLD_M = 500

// ── GET: valori suggeriti per precompilare il wizard (storico attività + profilo) ───────────────
// Nessun costo AI qui — solo letture Supabase già esistenti (lib/hikerContext.ts, stesse usate da
// app/api/route-search/route.ts). In modalità degradata risponde con suggerimenti vuoti invece di
// un errore, il wizard resta comunque utilizzabile con valori di default fissi.

export async function GET(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  if (!user) {
    return NextResponse.json({ suggestedDistanceKm: null, suggestedElevationM: null, environmentPrefs: [], concerns: [] })
  }

  const [profile, history] = await Promise.all([fetchHikerProfile(user.id), fetchActivitySummary(user.id)])
  return NextResponse.json({
    suggestedDistanceKm: history.count > 0 ? Math.round(history.avgDistanceKm * 10) / 10 : null,
    suggestedElevationM: history.count > 0 ? Math.round(history.avgElevationM) : null,
    environmentPrefs: sanitizeHikerEnvironmentPrefs(profile.environmentPrefs),
    concerns: sanitizeHikerConcerns(profile.concerns),
  })
}

// ── POST: genera i candidati ─────────────────────────────────────────────────────────────────
// Puro calcolo (Overpass + grafo + pathfinding + arricchimento DTM/POI): a differenza di
// route-search, nessuna chiamata Anthropic, quindi nessuna chiave AI richiesta all'utente.

interface BuildRequestBody {
  lat: number
  lon: number
  routeType: RouteType
  targetDistanceKm: number
  targetElevationM: number | null
}

function parseBody(raw: unknown): BuildRequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  const lat = Number(body.lat)
  const lon = Number(body.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Coordinate di partenza non valide')
  if (body.routeType !== 'anello' && body.routeType !== 'andata_ritorno') throw new Error('Tipo di percorso non valido')
  const targetDistanceKm = Number(body.targetDistanceKm)
  if (!Number.isFinite(targetDistanceKm) || targetDistanceKm < MIN_TARGET_DISTANCE_KM || targetDistanceKm > MAX_TARGET_DISTANCE_KM) {
    throw new Error(`Lunghezza target fuori range (${MIN_TARGET_DISTANCE_KM}-${MAX_TARGET_DISTANCE_KM} km)`)
  }
  const targetElevationRaw = Number(body.targetElevationM)
  const targetElevationM = body.targetElevationM != null && Number.isFinite(targetElevationRaw) ? targetElevationRaw : null
  return { lat, lon, routeType: body.routeType, targetDistanceKm, targetElevationM }
}

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

  let params: BuildRequestBody
  try {
    params = parseBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  let environmentPrefs: ReturnType<typeof sanitizeHikerEnvironmentPrefs> = []
  let concerns: ReturnType<typeof sanitizeHikerConcerns> = []
  if (user) {
    const profile = await fetchHikerProfile(user.id)
    environmentPrefs = sanitizeHikerEnvironmentPrefs(profile.environmentPrefs)
    concerns = sanitizeHikerConcerns(profile.concerns)
  }

  // Raggio del bbox attorno al punto di partenza: un anello/andata-ritorno di L km non cammina in
  // linea retta, quindi serve margine oltre al semplice L/2 geometrico per la rete effettivamente
  // interrogata — coperto da un fattore emprico (0.75) invece che il minimo teorico (0.5).
  const bboxRadiusKm = Math.min(Math.max(params.targetDistanceKm * 0.75, 2), 15)
  const bbox = padBbox([params.lat, params.lon, params.lat, params.lon], bboxRadiusKm)

  let network
  try {
    network = await fetchWalkNetwork(bbox)
  } catch (e) {
    console.error('[route-build] fetchWalkNetwork failed:', e)
    return NextResponse.json({ error: 'Rete sentieri non disponibile in questo momento, riprova.' }, { status: 502 })
  }

  const startNode = nearestGraphNode(network, params.lat, params.lon, START_SNAP_THRESHOLD_M)
  if (!startNode) {
    return NextResponse.json({
      error: 'no_network_nearby',
      message: 'Non ho trovato sentieri o strade percorribili abbastanza vicino al punto scelto — prova un punto di partenza diverso.',
    }, { status: 404 })
  }

  const targetDistanceM = params.targetDistanceKm * 1000
  const rawCandidates = params.routeType === 'anello'
    ? generateLoopCandidates(network, startNode.nodeId, targetDistanceM)
    : generateOutAndBackCandidates(network, startNode.nodeId, targetDistanceM)

  if (rawCandidates.length === 0) {
    return NextResponse.json({
      candidates: [],
      message: 'Nessun percorso trovato con questi vincoli nella zona scelta — prova una lunghezza diversa o un punto di partenza differente.',
    })
  }

  const candidates = await scoreAndEnrichCandidates(rawCandidates, {
    targetDistanceM,
    targetElevationM: params.targetElevationM,
    environmentPrefs,
    concerns,
  })

  if (candidates.length === 0) {
    return NextResponse.json({
      candidates: [],
      message: 'Ho trovato percorsi possibili ma senza copertura del modello altimetrico in questa zona — prova un punto di partenza differente.',
    })
  }

  return NextResponse.json({ candidates })
}
