import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { mergeStopCandidates, nearestStops, orderStopsNearestNeighbor } from '@/lib/metaSearch/borgoItinerary'
import { fetchBorgoArchiveStops, fetchBorgoWikiStops } from '@/lib/guideBorgoDetailStops'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { nearestGraphNode, type WalkNetwork } from '@/lib/routeBuilder/osmGraph'
import { dijkstra, reconstructPath } from '@/lib/routeBuilder/walkRouting'
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import type { SiteType } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Wikipedia + rete pedonale (cache-miss = fetch Overpass) + dijkstra per tappa

const MAX_STOPS = 6
const DIJKSTRA_MAX_DIST_M = 3000
const DIJKSTRA_MAX_NODES = 800
const SNAP_THRESHOLD_M = 300
// Più alto del default (18s, lib/routeBuilder/osmGraph.ts) — questo endpoint non ha stage pesanti
// a valle del fetch della rete (solo Dijkstra per tappa, già limitato da DIJKSTRA_MAX_NODES), a
// differenza di app/api/route-build/route.ts che a valle deve ancora fare pathfinding + DTM/POI.
// Un fetch a freddo (bbox mai cercato prima) di questa query è il passo più lento e la causa più
// comune di un itinerario che ripiega su linee d'aria per OGNI tratto — più margine qui aumenta
// le probabilità che Overpass risponda prima che fetchOverpass rinunci, senza avvicinarsi al
// tetto reale della piattaforma (worst case retry incluso: ~2×questo valore + 1.2s).
const WALK_NETWORK_TIMEOUT_MS = 22_000
// ~4.3 km/h — un ritmo da visita (con soste implicite), non una camminata sportiva: la stessa
// differenza per cui la stima di un Sentiero (lib/trailStats.ts) non è utilizzabile qui.
const WALK_SPEED_MPS = 1.2

export interface ItineraryStop {
  id: string
  name: string
  lat: number
  lon: number
  description?: string
  thumbnail?: string
  url?: string
  source: 'archivio' | 'wikipedia'
  siteType?: SiteType
}

export interface ItineraryLeg {
  /** -1 per il primo tratto (dal Borgo alla prima tappa) — altrimenti l'indice della tappa di
   *  partenza in `stops`. */
  fromIdx: number
  toIdx: number
  distanceM: number
  polyline: [number, number][]
  /** false quando non è stato trovato un cammino nella rete pedonale (tappa isolata, rete non
   *  disponibile) — il tratto è allora una linea d'aria di ripiego, mai spacciata per reale. */
  real: boolean
}

export interface BorgoItinerary {
  borgoName: string
  stops: ItineraryStop[]
  legs: ItineraryLeg[]
  totalDistanceM: number
  estimatedTimeSeconds: number
}

/**
 * POST /api/borgo-itinerary — itinerario a piedi fra le tappe principali di un Borgo/Città:
 * tappe dall'archivio (dtrek_places, meta_type='sito' nel raggio) + una geosearch Wikipedia dal
 * vivo intorno al centro (lib/wikipedia.ts's fetchNearbyWiki, arricchimento — mai l'unica fonte
 * di verità: piano §48.8), unite senza doppioni (lib/metaSearch/borgoItinerary.ts) e ordinate a
 * vicino-più-vicino. Il tragitto fra le tappe è un cammino reale sulla rete pedonale OSM (lib/
 * routeBuilder/osmGraph.ts + walkNetworkCache.ts, la stessa già usata per generare i Sentieri) via
 * Dijkstra (lib/routeBuilder/walkRouting.ts, condiviso con lib/navigation/escapeEngine.ts) — non
 * una linea d'aria, salvo quando una tappa risulta isolata dalla rete: quel singolo tratto resta
 * allora una linea d'aria, segnalata (`real: false`), il resto dell'itinerario non salta.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let placeId: string
  try {
    const body = await req.json()
    placeId = body.placeId
    if (!placeId || typeof placeId !== 'string') throw new Error()
  } catch {
    return NextResponse.json({ error: 'placeId mancante' }, { status: 400 })
  }

  const { data: borgo, error: borgoError } = await supabase
    .from('dtrek_places')
    .select('id, name, latitude, longitude')
    .eq('id', placeId)
    .eq('meta_type', 'borgo_citta')
    .maybeSingle()

  if (borgoError) {
    console.error('[borgo-itinerary]', borgoError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!borgo) return NextResponse.json({ error: 'Borgo/Città non trovato' }, { status: 404 })

  const center = { lat: borgo.latitude as number, lon: borgo.longitude as number }

  let archiveStops: Awaited<ReturnType<typeof fetchBorgoArchiveStops>>
  try {
    archiveStops = await fetchBorgoArchiveStops(supabase, center)
  } catch (e) {
    console.error('[borgo-itinerary]', e)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  const wikiStops = await fetchBorgoWikiStops(center).catch(e => {
    console.error('[borgo-itinerary] geosearch Wikipedia fallita', e)
    return []
  })

  const merged = mergeStopCandidates(archiveStops, wikiStops)
  const capped = nearestStops(center, merged, MAX_STOPS)
  const ordered = orderStopsNearestNeighbor(center, capped)

  if (ordered.length === 0) {
    const empty: BorgoItinerary = { borgoName: borgo.name, stops: [], legs: [], totalDistanceM: 0, estimatedTimeSeconds: 0 }
    return NextResponse.json(empty)
  }

  // Bbox della rete pedonale — tutte le tappe + il Borgo, con un margine di 400m: le vie che
  // portano a una tappa periferica spesso escono dal rettangolo stretto che le contiene tutte.
  const allPoints = [center, ...ordered]
  const rawBbox: [number, number, number, number] = [
    Math.min(...allPoints.map(p => p.lat)),
    Math.min(...allPoints.map(p => p.lon)),
    Math.max(...allPoints.map(p => p.lat)),
    Math.max(...allPoints.map(p => p.lon)),
  ]
  const networkBbox = padBbox(rawBbox, 0.4)

  let network: WalkNetwork | null = null
  try {
    network = await fetchWalkNetworkCached(networkBbox, false, WALK_NETWORK_TIMEOUT_MS)
  } catch (e) {
    console.error('[borgo-itinerary] rete pedonale non disponibile, ripiego su linee d\'aria', e)
  }

  const waypoints = [center, ...ordered.map(s => ({ lat: s.lat, lon: s.lon }))]
  const legs: ItineraryLeg[] = []
  let totalDistanceM = 0

  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = routeLeg(network, waypoints[i], waypoints[i + 1])
    legs.push({ fromIdx: i - 1, toIdx: i, distanceM: leg.distanceM, polyline: leg.polyline, real: leg.real })
    totalDistanceM += leg.distanceM
  }

  const itinerary: BorgoItinerary = {
    borgoName: borgo.name,
    stops: ordered.map(({ id, name, lat, lon, description, thumbnail, url, source, siteType }) =>
      ({ id, name, lat, lon, description, thumbnail, url, source, siteType })),
    legs,
    totalDistanceM,
    estimatedTimeSeconds: Math.round(totalDistanceM / WALK_SPEED_MPS),
  }
  return NextResponse.json(itinerary)
}

function routeLeg(
  network: WalkNetwork | null,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): { distanceM: number; polyline: [number, number][]; real: boolean } {
  const straightLine = {
    distanceM: haversineM(from.lat, from.lon, to.lat, to.lon),
    polyline: [[from.lat, from.lon], [to.lat, to.lon]] as [number, number][],
    real: false,
  }
  if (!network || network.nodes.size === 0) return straightLine

  const start = nearestGraphNode(network, from.lat, from.lon, SNAP_THRESHOLD_M)
  const end = nearestGraphNode(network, to.lat, to.lon, SNAP_THRESHOLD_M)
  if (!start || !end) return straightLine

  const { dist, prev } = dijkstra(network, start.nodeId, DIJKSTRA_MAX_DIST_M, DIJKSTRA_MAX_NODES)
  const targetDist = dist.get(end.nodeId)
  if (targetDist == null) return straightLine

  return {
    distanceM: targetDist + start.distM + end.distM,
    polyline: reconstructPath(network, prev, end.nodeId, start.nodeId),
    real: true,
  }
}
