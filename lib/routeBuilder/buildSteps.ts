// Logica condivisa tra la pipeline "Su misura" monolitica (app/api/route-build/route.ts, mantenuta
// invariata come endpoint per compatibilità) e i tre endpoint a step (app/api/route-build/step/*,
// vedi quel modulo per il perché sono stati introdotti) — stessa identica logica in entrambi i casi,
// solo richiamabile sia in un'unica richiesta sia spezzata in più chiamate HTTP brevi, ciascuna col
// proprio tetto di 60s (maxDuration) invece che una sola richiesta a portarle tutte.
//
// SERVER-ONLY: importa fetchWalkNetworkCached (Supabase con service_role key, vedi lib/supabase.ts)
// e fetchHikerProfile — non deve MAI essere importato da un componente client. Le soglie
// riutilizzabili anche lato client (MIN_BUILT_RESULTS, RETRY_DISTANCE_FACTORS, candidateSignature...)
// vivono deliberatamente in lib/routeBuilder/buildConstants.ts, senza import server-only.
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { nearestGraphNode, type WalkNetwork } from '@/lib/routeBuilder/osmGraph'
import {
  generateLoopCandidates, generateOutAndBackCandidates, generateOneWayCandidates,
  generateOutAndBackToPoint, type RouteCandidate, type RouteType,
} from '@/lib/routeBuilder/loopBuilder'
import { fetchHikerProfile } from '@/lib/hikerContext'
import { sanitizeHikerConcerns, sanitizeHikerEnvironmentPrefs } from '@/lib/hikerProfile'
import { POI_META, type PoiType } from '@/lib/overpass'
import { MIN_TARGET_DISTANCE_KM, MAX_TARGET_DISTANCE_KM, DEFAULT_RADIUS_KM, ALLOWED_RADIUS_KM } from '@/lib/routeBuilder/buildConstants'

const VALID_POI_TYPES = new Set(Object.keys(POI_META))

const START_SNAP_THRESHOLD_M = 500
// Tetto per la modalità "dintorni" (vedi BuildRequestBody.startMode): il raggio scelto dall'utente
// può arrivare a 100 km, ma qui va clampato allo stesso tetto di sicurezza del bbox (10 km) — oltre,
// sia la ricerca del punto d'aggancio sia il bbox interrogato via Overpass rischierebbero query
// pesanti che hanno già causato dei 504/timeout in passato.
const BUILD_DINTORNI_MAX_KM = 8

export interface BuildRequestBody {
  lat: number
  lon: number
  routeType: RouteType
  targetDistanceKm: number
  targetElevationM: number | null
  // Destinazione esatta (luogo noto risolto per nome) — opzionale per andata_ritorno e solo_andata
  // (per un anello non ha senso, si torna comunque al punto di partenza): qui la lunghezza è un
  // risultato del percorso reale verso quel punto, non un vincolo, quindi targetDistanceKm viene
  // ignorato quando presente.
  destinationLat: number | null
  destinationLon: number | null
  environmentPrefs: ReturnType<typeof sanitizeHikerEnvironmentPrefs> | null
  desiredPoiTypes: PoiType[]
  radiusKm: number
  startMode: 'esatto' | 'dintorni'
}

export function sanitizeRadiusKm(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM
  return ALLOWED_RADIUS_KM.reduce((best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best)
}

export function parseBuildRequestBody(raw: unknown): BuildRequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  const lat = Number(body.lat)
  const lon = Number(body.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Coordinate di partenza non valide')
  if (body.routeType !== 'anello' && body.routeType !== 'andata_ritorno' && body.routeType !== 'solo_andata') {
    throw new Error('Tipo di percorso non valido')
  }
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

  const radiusKm = sanitizeRadiusKm(body.radiusKm)
  const startMode = body.startMode === 'dintorni' ? 'dintorni' : 'esatto'

  return { lat, lon, routeType: body.routeType, targetDistanceKm, targetElevationM, destinationLat, destinationLon, environmentPrefs, desiredPoiTypes, radiusKm, startMode }
}

// Stessa scelta del ramo anello/andata_ritorno/solo_andata — riusata sia dalla pipeline monolitica
// sia da app/api/route-build/step/candidates/route.ts (i ritentativi con lunghezza alternativa).
export function generateRawCandidatesForLength(
  network: WalkNetwork, startNodeId: number, routeType: RouteType, distanceM: number,
): RouteCandidate[] {
  switch (routeType) {
    case 'anello':
      return generateLoopCandidates(network, startNodeId, distanceM)
    case 'solo_andata':
      return generateOneWayCandidates(network, startNodeId, distanceM)
    default:
      return generateOutAndBackCandidates(network, startNodeId, distanceM)
  }
}

export interface NetworkPrep {
  bbox: [number, number, number, number]
  network: WalkNetwork
  startNodeId: number
  targetDistanceM: number
  hasDestination: boolean
  // Popolato SOLO nel caso "destinazione" (un unico candidato, già generato qui perché richiede
  // comunque la rete in memoria — un solo Dijkstra, economico) — vuoto altrimenti: senza
  // destinazione, il pathfinding vero e proprio (esplorazione su più direzioni) è lo step successivo
  // (generateRawCandidatesForLength, chiamato da executeBuild o da step/candidates).
  rawCandidates: RouteCandidate[]
  concerns: ReturnType<typeof sanitizeHikerConcerns>
  environmentPrefs: ReturnType<typeof sanitizeHikerEnvironmentPrefs>
}

export type NetworkPrepOutcome =
  | { ok: true; prep: NetworkPrep }
  | { ok: false; status: number; error: string; message: string; details?: Record<string, unknown> }

/**
 * Step 1 della pipeline "Su misura": profilo utente, calcolo bbox, fetch/cache della rete
 * percorribile, aggancio al nodo di partenza — e, solo per una destinazione esatta, anche il
 * pathfinding verso quel punto. Usata sia da executeBuild (app/api/route-build/route.ts, invariato)
 * sia da app/api/route-build/step/network/route.ts — stessa identica logica in entrambi i casi,
 * `awaitCacheWrite` è l'unica differenza (vedi walkNetworkCache.ts).
 */
export async function prepareNetworkStep(
  user: { id: string } | null, params: BuildRequestBody, awaitCacheWrite: boolean,
): Promise<NetworkPrepOutcome> {
  let concerns: ReturnType<typeof sanitizeHikerConcerns> = []
  let environmentPrefs = params.environmentPrefs ?? []
  if (user) {
    try {
      const profile = await fetchHikerProfile(user.id)
      concerns = sanitizeHikerConcerns(profile.concerns)
      if (params.environmentPrefs == null) environmentPrefs = sanitizeHikerEnvironmentPrefs(profile.environmentPrefs)
    } catch (e) {
      // Un profilo non recuperabile (es. Supabase momentaneamente non raggiungibile) non deve far
      // fallire l'intera generazione — si prosegue con i valori di default/quelli passati dal client.
      console.error('[buildSteps] fetchHikerProfile fallito, proseguo con i valori di default:', e)
    }
  }

  const hasDestination = params.routeType !== 'anello' && params.destinationLat != null && params.destinationLon != null

  // Raggio del bbox attorno al punto di partenza — vedi commento esteso nella versione precedente
  // (git log di app/api/route-build/route.ts) per il perché dei fattori: senza destinazione un
  // anello/andata-ritorno di L km non cammina in linea retta (fattore 0.6 invece del minimo teorico
  // 0.5); con destinazione il bbox deve contenere il punto esatto richiesto. Tetto a 10 km in
  // entrambi i casi: oltre, il bbox interrogato via Overpass rischia di superare il tempo disponibile.
  const dintorniRadiusKm = params.startMode === 'dintorni' ? Math.min(params.radiusKm, BUILD_DINTORNI_MAX_KM) : 0
  const bboxRadiusKm = Math.min(
    Math.max(
      hasDestination
        ? Math.min(Math.max(haversineM(params.lat, params.lon, params.destinationLat!, params.destinationLon!) / 1000 * 0.6, 2), 10)
        : Math.min(Math.max(params.targetDistanceKm * 0.6, 2), 10),
      dintorniRadiusKm,
    ),
    10,
  )
  const bbox = padBbox([params.lat, params.lon, params.lat, params.lon], bboxRadiusKm)

  let network: WalkNetwork
  try {
    network = await fetchWalkNetworkCached(bbox, awaitCacheWrite)
  } catch (e) {
    console.error('[buildSteps] fetchWalkNetwork failed:', e)
    return { ok: false, status: 502, error: 'network_unavailable', message: 'Rete sentieri non disponibile in questo momento, riprova.' }
  }

  console.log(`[buildSteps] rete: ${network.nodes.size} nodi, bbox raggio ${bboxRadiusKm.toFixed(1)}km`)

  const startSnapThresholdM = params.startMode === 'dintorni' ? dintorniRadiusKm * 1000 : START_SNAP_THRESHOLD_M
  const startNode = nearestGraphNode(network, params.lat, params.lon, startSnapThresholdM)
  if (!startNode) {
    return {
      ok: false, status: 404, error: 'no_network_nearby',
      message: params.startMode === 'dintorni'
        ? 'Non ho trovato sentieri o strade percorribili nei dintorni di questo luogo, entro il raggio scelto — prova un raggio più ampio o un luogo diverso.'
        : 'Non ho trovato sentieri o strade percorribili abbastanza vicino al punto scelto — prova un punto di partenza diverso, o la modalità "Nei dintorni".',
      details: { networkNodes: network.nodes.size, startMode: params.startMode },
    }
  }

  let targetDistanceM: number
  let rawCandidates: RouteCandidate[] = []

  if (hasDestination) {
    const destinationCandidate = generateOutAndBackToPoint(
      network, startNode.nodeId, params.destinationLat!, params.destinationLon!,
      undefined, params.routeType === 'solo_andata',
    )
    if (!destinationCandidate) {
      return {
        ok: false, status: 404, error: 'destination_unreachable',
        message: 'La destinazione indicata non è abbastanza vicina a sentieri o strade percorribili, o non è raggiungibile dal punto di partenza — prova un\'altra destinazione.',
      }
    }
    targetDistanceM = destinationCandidate.distanceM
    rawCandidates = [destinationCandidate]
  } else {
    targetDistanceM = params.targetDistanceKm * 1000
  }

  return {
    ok: true,
    prep: { bbox, network, startNodeId: startNode.nodeId, targetDistanceM, hasDestination, rawCandidates, concerns, environmentPrefs },
  }
}
