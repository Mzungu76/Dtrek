import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import { fetchWalkNetwork, nearestGraphNode } from '@/lib/routeBuilder/osmGraph'
import { generateLoopCandidates, generateOutAndBackCandidates, generateOutAndBackToPoint, type RouteType } from '@/lib/routeBuilder/loopBuilder'
import { scoreAndEnrichCandidates } from '@/lib/routeBuilder/scoreCandidates'
import { fetchHikerProfile, fetchActivitySummary } from '@/lib/hikerContext'
import { sanitizeHikerConcerns, sanitizeHikerEnvironmentPrefs } from '@/lib/hikerProfile'
import { POI_META, type PoiType } from '@/lib/overpass'

const VALID_POI_TYPES = new Set(Object.keys(POI_META))

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_TARGET_DISTANCE_KM = 1
// Abbassato da 20 a 15: un target più alto allarga il bbox interrogato via Overpass (vedi
// bboxRadiusKm sotto) fino a superare, in aree con rete fitta, il tempo disponibile prima che la
// funzione venga terminata dalla piattaforma (504 osservato in produzione) — vedi anche il
// restringimento dei tag highway in lib/routeBuilder/osmGraph.ts, la causa principale dello stesso problema.
const MAX_TARGET_DISTANCE_KM = 15
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
    return NextResponse.json({
      suggestedDistanceKm: null, suggestedElevationM: null, environmentPrefs: [], concerns: [],
      routeBuildAiPlaceSearch: true,
    })
  }

  const [profile, history] = await Promise.all([fetchHikerProfile(user.id), fetchActivitySummary(user.id)])
  return NextResponse.json({
    suggestedDistanceKm: history.count > 0 ? Math.round(history.avgDistanceKm * 10) / 10 : null,
    suggestedElevationM: history.count > 0 ? Math.round(history.avgElevationM) : null,
    environmentPrefs: sanitizeHikerEnvironmentPrefs(profile.environmentPrefs),
    concerns: sanitizeHikerConcerns(profile.concerns),
    routeBuildAiPlaceSearch: profile.routeBuildAiPlaceSearch,
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
  // Destinazione esatta (luogo noto risolto per nome, vedi lib/routeBuilder/resolvePlace.ts) —
  // solo per andata_ritorno: qui la lunghezza è un risultato del percorso reale verso quel punto,
  // non un vincolo, quindi targetDistanceKm viene ignorato quando presente.
  destinationLat: number | null
  destinationLon: number | null
  // Precompilati dal profilo (GET sopra) ma modificabili per questa singola ricerca — null
  // significa "non inviato dal client", si ricade sul profilo come faceva già il codice originale.
  environmentPrefs: ReturnType<typeof sanitizeHikerEnvironmentPrefs> | null
  desiredPoiTypes: PoiType[]
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

  const destLatRaw = Number(body.destinationLat)
  const destLonRaw = Number(body.destinationLon)
  const hasDestination = body.destinationLat != null && body.destinationLon != null && Number.isFinite(destLatRaw) && Number.isFinite(destLonRaw)
  const destinationLat = hasDestination ? destLatRaw : null
  const destinationLon = hasDestination ? destLonRaw : null

  const environmentPrefs = Array.isArray(body.environmentPrefs) ? sanitizeHikerEnvironmentPrefs(body.environmentPrefs) : null
  const desiredPoiTypes = Array.isArray(body.desiredPoiTypes)
    ? body.desiredPoiTypes.filter((t): t is PoiType => typeof t === 'string' && VALID_POI_TYPES.has(t))
    : []

  return { lat, lon, routeType: body.routeType, targetDistanceKm, targetElevationM, destinationLat, destinationLon, environmentPrefs, desiredPoiTypes }
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

  let concerns: ReturnType<typeof sanitizeHikerConcerns> = []
  let environmentPrefs = params.environmentPrefs ?? []
  if (user) {
    const profile = await fetchHikerProfile(user.id)
    concerns = sanitizeHikerConcerns(profile.concerns)
    if (params.environmentPrefs == null) environmentPrefs = sanitizeHikerEnvironmentPrefs(profile.environmentPrefs)
  }

  // La destinazione si applica solo ad andata_ritorno (per un anello si torna comunque al punto di
  // partenza) — se il client la manda insieme a 'anello' (non dovrebbe succedere con la UI
  // prevista) viene semplicemente ignorata invece di far fallire la richiesta.
  const hasDestination = params.routeType === 'andata_ritorno' && params.destinationLat != null && params.destinationLon != null

  // Raggio del bbox attorno al punto di partenza. Senza destinazione: un anello/andata-ritorno di
  // L km non cammina in linea retta, quindi serve margine oltre al semplice L/2 geometrico per la
  // rete effettivamente interrogata — coperto da un fattore emprico (0.6) invece del minimo
  // teorico (0.5). Con destinazione: il raggio deve contenere il punto esatto richiesto, non un
  // target di lunghezza scelto dall'utente (che qui non è più un vincolo) — si usa la distanza in
  // linea d'aria verso la destinazione con lo stesso margine. Tetto a 10 km in entrambi i casi:
  // oltre, il bbox interrogato via Overpass diventa abbastanza grande da rischiare di superare il
  // tempo disponibile prima del kill della funzione lato piattaforma.
  const bboxRadiusKm = hasDestination
    ? Math.min(Math.max(haversineM(params.lat, params.lon, params.destinationLat!, params.destinationLon!) / 1000 * 0.6, 2), 10)
    : Math.min(Math.max(params.targetDistanceKm * 0.6, 2), 10)
  const bbox = padBbox([params.lat, params.lon, params.lat, params.lon], bboxRadiusKm)

  let network
  try {
    network = await fetchWalkNetwork(bbox)
  } catch (e) {
    console.error('[route-build] fetchWalkNetwork failed:', e)
    return NextResponse.json({ error: 'Rete sentieri non disponibile in questo momento, riprova.' }, { status: 502 })
  }

  console.log(`[route-build] rete: ${network.nodes.size} nodi, bbox raggio ${bboxRadiusKm.toFixed(1)}km`)

  const startNode = nearestGraphNode(network, params.lat, params.lon, START_SNAP_THRESHOLD_M)
  if (!startNode) {
    return NextResponse.json({
      error: 'no_network_nearby',
      message: 'Non ho trovato sentieri o strade percorribili abbastanza vicino al punto scelto — prova un punto di partenza diverso.',
    }, { status: 404 })
  }

  let rawCandidates
  let targetDistanceM: number

  if (hasDestination) {
    const destinationCandidate = generateOutAndBackToPoint(network, startNode.nodeId, params.destinationLat!, params.destinationLon!)
    if (!destinationCandidate) {
      return NextResponse.json({
        error: 'destination_unreachable',
        message: 'La destinazione indicata non è abbastanza vicina a sentieri o strade percorribili, o non è raggiungibile dal punto di partenza — prova un\'altra destinazione.',
      }, { status: 404 })
    }
    // La lunghezza reale ottenuta diventa il target per il punteggio di affinità — qui non c'è un
    // vincolo di lunghezza da rispettare, quindi non va penalizzato l'unico risultato possibile.
    targetDistanceM = destinationCandidate.distanceM
    rawCandidates = [destinationCandidate]
  } else {
    targetDistanceM = params.targetDistanceKm * 1000
    rawCandidates = params.routeType === 'anello'
      ? generateLoopCandidates(network, startNode.nodeId, targetDistanceM)
      : generateOutAndBackCandidates(network, startNode.nodeId, targetDistanceM)
  }

  console.log(`[route-build] candidati grezzi entro tolleranza: ${rawCandidates.length}`)

  if (rawCandidates.length === 0) {
    return NextResponse.json({
      candidates: [],
      message: 'Nessun percorso trovato con questi vincoli nella zona scelta — prova una lunghezza diversa o un punto di partenza differente.',
    })
  }

  let candidates
  try {
    candidates = await scoreAndEnrichCandidates(rawCandidates, {
      targetDistanceM,
      targetElevationM: params.targetElevationM,
      environmentPrefs,
      concerns,
      desiredPoiTypes: params.desiredPoiTypes,
      bbox,
    })
  } catch (e) {
    console.error('[route-build] scoreAndEnrichCandidates failed:', e)
    return NextResponse.json({ error: 'Arricchimento dei percorsi non riuscito, riprova.' }, { status: 502 })
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      candidates: [],
      message: 'Ho trovato percorsi possibili ma senza copertura del modello altimetrico in questa zona — prova un punto di partenza differente.',
    })
  }

  return NextResponse.json({ candidates })
}
