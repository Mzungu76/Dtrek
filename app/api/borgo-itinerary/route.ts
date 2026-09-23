import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, type ItineraryStopCandidate } from '@/lib/metaSearch/borgoItinerary'
import { fetchBorgoArchiveStops, fetchBorgoWikiStops, enrichStopDescriptions } from '@/lib/guideBorgoDetailStops'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { nearestGraphNode, type WalkNetwork } from '@/lib/routeBuilder/osmGraph'
import { dijkstra, reconstructPath } from '@/lib/routeBuilder/walkRouting'
import { padBbox } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import type { SiteType } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'
// Alzato da 60s — verifica utente: il raggio di ricerca ora si allarga fino a 20km per una città
// grande, con fino a 4 giri di geosearch archivio/Wikipedia invece di uno solo. Pagato una sola
// volta ogni 30 giorni per borgo grazie alla cache sotto, mai ad ogni apertura della guida — ben
// entro il tetto reale della piattaforma (300s, piano Vercel di questo progetto).
export const maxDuration = 120

// Verifica utente — "la dimensione geografica della città/borgo": invece di un raggio fisso, si
// parte stretto (comportamento invariato per un borgo compatto) e si allarga finché si continuano
// a trovare punti nuovi in quantità significativa, fino al tetto di MAX_TOTAL_STOPS o al raggio
// massimo — una città vera "riempie" ogni passo, un borgo piccolo esaurisce i punti trovabili
// presto e il raggio si ferma corto da solo. Ogni passo riparte da zero con un raggio più ampio
// (non incrementale, mai bisogno di deduplicare "anelli" di raggio) — il costo extra dei passi
// successivi è pagato una sola volta ogni 30 giorni per borgo, grazie alla cache sotto.
const RADIUS_STEPS: { radiusKm: number; wikiLimit: number; archiveLimit: number }[] = [
  { radiusKm: 2.5, wikiLimit: 10, archiveLimit: 60 },
  { radiusKm: 5,   wikiLimit: 20, archiveLimit: 120 },
  { radiusKm: 10,  wikiLimit: 35, archiveLimit: 200 },
  { radiusKm: 20,  wikiLimit: 50, archiveLimit: 300 },
]
// Un passo che aggiunge meno di questa soglia di candidati NUOVI rispetto al passo precedente
// segnala rendimento decrescente (il borgo è già "esaurito"): allargare ulteriormente il raggio
// non aggiungerebbe granché, si preferisce fermarsi lì piuttosto che pagare altri due giri di
// rete per pochi punti in più.
const MIN_NEW_CANDIDATES_TO_KEEP_EXPANDING = 3
// Tetto complessivo sull'intera città (non per singola tappa — quello è MAX_STOPS_PER_TAPPA in
// lib/metaSearch/borgoItinerary.ts, applicato lato client dopo il raggruppamento in tappe): anche
// la città più grande non deve produrre un itinerario open-ended, che appesantirebbe Dijkstra/
// l'arricchimento descrizioni oltre ogni beneficio reale per l'utente.
const MAX_TOTAL_STOPS = 30
// Verifica utente: l'itinerario si ricalcolava da zero ad ogni apertura della guida, anche per lo
// stesso borgo appena visto — 30 giorni perché le fonti (voci Wikipedia, rete pedonale OSM) cambiano
// di rado, un mese di cache non produce quasi mai un dato percepibilmente vecchio. Cache SUL BORGO
// (dtrek_places), non sulla guida: condivisa tra tutti gli utenti/guide che aprono lo stesso borgo.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DIJKSTRA_MAX_DIST_M = 3000
const DIJKSTRA_MAX_NODES = 800
const SNAP_THRESHOLD_M = 300
// Verifica utente ("gli itinerari sono tornati in linea d'aria") — confermato sui dati reali: per
// Trento (7 tappe, area compatta ~3km) solo 1 leg su 7 risultava reale, le altre tutte in linea
// d'aria. Causa (vedi il commento su `remark` in lib/routeBuilder/osmGraph.ts's fetchWalkNetwork):
// Overpass può interrompere la query al proprio [timeout:...] interno e rispondere comunque con
// HTTP 200 e una rete PARZIALE — un fallimento silenzioso, mai visto come errore da fetchOverpass,
// quindi mai ritentato. Il centro di una vera città (rete stradale molto più densa per km² di un
// borgo — decine di vie/vicoli invece di poche strade tra campi) rischia di riempire il budget
// [timeout:] molto prima di un'area della stessa estensione intorno a un piccolo borgo: alzato da
// 22s per dare a Overpass margine sufficiente a completare la query anche per un centro storico
// denso, ben entro il tetto della piattaforma (maxDuration=120s sopra, worst case col retry
// dell'ALTRA modalità di fallimento — un errore di rete vero e proprio, quella sì ritentata da
// fetchOverpass — resta comunque ~2×questo valore + 1.2s).
const WALK_NETWORK_TIMEOUT_MS = 45_000
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
    .select('id, name, latitude, longitude, itinerary_cache, itinerary_cached_at')
    .eq('id', placeId)
    .eq('meta_type', 'borgo_citta')
    .maybeSingle()

  if (borgoError) {
    console.error('[borgo-itinerary]', borgoError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
  if (!borgo) return NextResponse.json({ error: 'Borgo/Città non trovato' }, { status: 404 })

  // Cache ancora valida — skip completo di geosearch/rete pedonale/Dijkstra, mai un dato scaduto
  // silenziosamente servito oltre il TTL dichiarato.
  const cachedAt = borgo.itinerary_cached_at ? new Date(borgo.itinerary_cached_at as string).getTime() : 0
  if (borgo.itinerary_cache && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(borgo.itinerary_cache as BorgoItinerary)
  }

  const center = { lat: borgo.latitude as number, lon: borgo.longitude as number }

  let merged: ItineraryStopCandidate[] = []
  for (const step of RADIUS_STEPS) {
    let archiveStops: ItineraryStopCandidate[]
    try {
      archiveStops = await fetchBorgoArchiveStops(supabase, center, step.radiusKm, step.archiveLimit)
    } catch (e) {
      console.error('[borgo-itinerary]', e)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
    const wikiStops = await fetchBorgoWikiStops(center, step.radiusKm, step.wikiLimit).catch(e => {
      console.error('[borgo-itinerary] geosearch Wikipedia fallita', e)
      return []
    })
    const previousCount = merged.length
    merged = mergeStopCandidates(archiveStops, wikiStops)
    if (merged.length >= MAX_TOTAL_STOPS) break
    if (step !== RADIUS_STEPS[0] && merged.length - previousCount < MIN_NEW_CANDIDATES_TO_KEEP_EXPANDING) break
  }

  const capped = nearestStops(center, merged, MAX_TOTAL_STOPS)
  // Verifica utente: descrizioni delle tappe "più esaustive" (e coerenti tra loro, non solo per
  // quelle da Wikipedia) — lib/guideBorgoDetailStops.ts's enrichStopDescriptions, stessa funzione
  // riusata da app/api/guide/route.ts per il prompt, applicata SOLO alle tappe che sopravvivono
  // alla selezione finale, mai all'intero elenco di candidati scartati.
  const ordered = await enrichStopDescriptions(orderStopsNearestNeighbor(center, capped))

  if (ordered.length === 0) {
    // Mai messo in cache: un elenco vuoto qui può derivare da un genuino "nessuna tappa nei
    // dintorni" ma anche da un fallimento silenzioso della geosearch Wikipedia (wikiStops ricade
    // su [] sopra) — cachare un falso negativo per 30 giorni sarebbe peggio di ricalcolare ogni
    // volta. Il prossimo tentativo riparte sempre da zero, come prima di questa cache.
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

  // Fire-and-forget, come lib/wikidataFallback.ts/lib/placePhotoCache.ts: la risposta non deve mai
  // aspettare la scrittura della cache. Solo quando la rete pedonale è stata trovata davvero (mai
  // quando `network` è null e ogni leg è quindi una linea d'aria di ripiego) — altrimenti un esito
  // degradato per un problema temporaneo di Overpass resterebbe "congelato" in cache per 30 giorni
  // invece di lasciare che il prossimo tentativo riprovi con la rete vera.
  if (network) {
    supabase
      .from('dtrek_places')
      .update({ itinerary_cache: itinerary, itinerary_cached_at: new Date().toISOString() })
      .eq('id', placeId)
      .then(
        ({ error }) => { if (error) console.error('[borgo-itinerary] cache update fallito:', error.message) },
        (e: unknown) => console.error('[borgo-itinerary] cache update fallito:', e),
      )
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
