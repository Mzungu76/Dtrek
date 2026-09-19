// Itinerario a piedi che deve toccare TUTTE le tappe scelte dall'utente, nell'ordine di selezione
// — a differenza di app/api/borgo-itinerary/route.ts (itinerario automatico passivo, tappe
// scoperte in autonomia e ordinate a vicino-più-vicino), questa è una generazione DELIBERATA:
// l'utente ha scelto a mano quali punti toccare. Un tratto irraggiungibile non blocca comunque
// l'intera generazione — MAI un fallimento completo: quella sola tratta ripiega su una linea
// diretta fra i due punti (`real:false`), segnalata esplicitamente nel risultato, mentre le altre
// tratte restano reali. Un fallimento totale costringerebbe l'utente a rinunciare o a cambiare
// selezione prima di vedere qualunque cosa — un risultato parziale ma dichiarato è sempre preferibile.
// Puro (nessun import Supabase/Overpass), stesso livello di lib/routeBuilder/loopBuilder.ts — chi
// chiama fornisce già il WalkNetwork.
//
// Distanza target: NON semplicemente il cammino più breve fra le tappe — se l'utente ha impostato
// una distanza (e il più breve è già più corto), si cerca il percorso che vi si avvicina di più,
// non quello minimo. Il più breve resta l'unica scelta quando non c'è un target, o quando il
// target è già raggiunto/superato dal più breve (non si può accorciare sotto il minimo) — e non si
// applica affatto a una tratta già in ripiego a linea d'aria (niente su cui cercare).
import { nearestGraphNode, type WalkNetwork, type GraphEdge } from './osmGraph'
import { dijkstra, reconstructPath, reconstructNodePath } from './walkRouting'
import { haversineM } from '../geoUtils'

export type MultiStopMode = 'urbano' | 'misto'

// "Trekking urbano": solo le vie di un centro abitato, mai un sentiero/tracciato/mulattiera — le
// stesse esclusioni descritte dall'utente ("deve ignorare i sentieri"). `footway` resta escluso
// insieme a path/track/bridleway/steps: OSM non distingue nei tag un marciapiede urbano da un
// sentiero di campagna, quindi non c'è modo affidabile di tenere l'uno ed escludere l'altro — la
// rete percorribile fetchata (WALKABLE_HIGHWAY, lib/routeBuilder/osmGraph.ts) resta comunque la
// stessa in entrambe le modalità, qui si filtra solo in fase di attraversamento del grafo.
const URBAN_ALLOWED_HIGHWAY = new Set(['residential', 'unclassified'])

function urbanEdgeFilter(edge: GraphEdge): boolean {
  return edge.highway != null && URBAN_ALLOWED_HIGHWAY.has(edge.highway)
}

// Soglia di aggancio più larga di quella dell'itinerario automatico (300m, borgo-itinerary) — le
// tappe qui sono scelte liberamente dall'utente sulla mappa, spesso più sparse delle sole "tappe
// vicine" scoperte in autonomia.
const SNAP_THRESHOLD_M = 350
// Un tetto FISSO (come 8000, il valore precedente — mutuato da borgo-itinerary.ts, pensato per
// tappe auto-scoperte entro 2.5km dal Borgo) è troppo stretto qui: le tappe sono scelte
// liberamente dall'utente, spesso paesi diversi a diversi km in linea d'aria — e il cammino REALE
// su strada, specie fra centri separati da una valle (mai in linea retta), supera facilmente il
// doppio o il triplo della distanza in linea d'aria. Il budget scala con quanto sono distanti le
// due tappe, con un pavimento e un tetto di sicurezza (mai oltre MAX_TARGET_DISTANCE_KM
// dell'intera app, 15km — buildConstants.ts).
const DIJKSTRA_MIN_DIST_M = 8000
const DIJKSTRA_MAX_DIST_CAP_M = 20000
const DIJKSTRA_DIST_MULTIPLIER = 3
// Con walkRouting.ts's dijkstra() ora basata su una coda a priorità (O((V+E) log V) invece di
// O(V²)), un tetto di nodi alto costa poco — qui serve solo come rete di sicurezza contro un bbox
// patologicamente denso, non più il vincolo pratico che era: prima, un budget troppo basso poteva
// esaurirsi esplorando una rete locale densa (vicoli, strade residenziali) PRIMA di raggiungere un
// sentiero lontano che esisteva davvero — un fallimento di ricerca, non di dati.
const DIJKSTRA_MAX_NODES = 25000

// Quante alternative (oltre al più breve) provare per avvicinarsi al target di lunghezza di UNA
// tratta — ogni tentativo è un intero Dijkstra sulla stessa rete; con l'heap il costo per tentativo
// è basso, ma il numero resta contenuto: è un'euristica ("prova un'altra via", non un ottimo
// garantito), non una ricerca esaustiva di ogni percorso possibile.
const MAX_DETOUR_ATTEMPTS = 3
// Sotto questo scarto relativo dal target, un tentativo è già abbastanza vicino da non valere la
// pena cercarne uno migliore.
const DETOUR_CLOSE_ENOUGH = 0.1

function legDijkstraBudgetM(from: { lat: number; lon: number }, to: { lat: number; lon: number }, legTargetM?: number): number {
  const airlineM = haversineM(from.lat, from.lon, to.lat, to.lon)
  const base = Math.max(DIJKSTRA_MIN_DIST_M, airlineM * DIJKSTRA_DIST_MULTIPLIER)
  const withTarget = legTargetM != null ? Math.max(base, legTargetM * 1.3) : base
  return Math.min(DIJKSTRA_MAX_DIST_CAP_M, withTarget)
}

// Chiave non orientata di un arco (gli archi sono sempre presenti in entrambe le direzioni, vedi
// addEdge in osmGraph.ts) — usata solo per "questo arco è già stato percorso da un tentativo
// precedente", mai per identificare in modo univoco una via OSM specifica (due way diverse che
// condividono per coincidenza la stessa coppia di nodi vengono trattate come lo stesso arco: va
// bene, qui serve solo variare il percorso, non un'identità perfetta).
function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

function edgeKeysOfPath(nodeIds: number[]): Set<string> {
  const keys = new Set<string>()
  for (let i = 0; i < nodeIds.length - 1; i++) keys.add(edgeKey(nodeIds[i], nodeIds[i + 1]))
  return keys
}

interface LegSearchResult { distanceM: number; polyline: [number, number][]; nodeIds: number[] }

function runLegDijkstra(
  network: WalkNetwork, startNodeId: number, endNodeId: number, maxDistM: number,
  isEdgeAllowed: ((edge: GraphEdge, fromNodeId: number) => boolean) | undefined,
): LegSearchResult | null {
  const { dist, prev } = dijkstra(network, startNodeId, maxDistM, DIJKSTRA_MAX_NODES, isEdgeAllowed)
  const distanceM = dist.get(endNodeId)
  if (distanceM == null) return null
  return {
    distanceM,
    polyline: reconstructPath(network, prev, endNodeId, startNodeId),
    nodeIds: reconstructNodePath(prev, endNodeId, startNodeId),
  }
}

function shortestLegPath(
  network: WalkNetwork, startNodeId: number, endNodeId: number, mode: MultiStopMode,
): LegSearchResult | null {
  const baseFilter = mode === 'urbano' ? (edge: GraphEdge) => urbanEdgeFilter(edge) : undefined
  const from = network.nodes.get(startNodeId)
  const to = network.nodes.get(endNodeId)
  if (!from || !to) return null
  return runLegDijkstra(network, startNodeId, endNodeId, legDijkstraBudgetM(from, to), baseFilter)
}

/**
 * A partire da un cammino già trovato (`shortest`, il più breve fra i due estremi), cerca di
 * avvicinarsi a `legTargetM` escludendo via via gli archi già percorsi nei tentativi precedenti,
 * forzando un'alternativa diversa (stesso principio del ritorno di un anello in loopBuilder.ts, qui
 * applicato punto-a-punto fra due estremi fissi invece che verso un punto scelto liberamente) — non
 * ricalcola `shortest` da zero (il chiamante lo ha già), un'euristica che prova poche alternative
 * in più, non una ricerca esaustiva: se la rete offre una sola via reale fra i due punti, resta
 * quella, comunque più corta del target richiesto.
 */
function seekCloserToTarget(
  network: WalkNetwork, startNodeId: number, endNodeId: number, shortest: LegSearchResult, legTargetM: number, mode: MultiStopMode,
): LegSearchResult {
  const baseFilter = mode === 'urbano' ? (edge: GraphEdge) => urbanEdgeFilter(edge) : undefined
  const from = network.nodes.get(startNodeId)!
  const to = network.nodes.get(endNodeId)!

  let best = shortest
  const excluded = edgeKeysOfPath(shortest.nodeIds)
  for (let attempt = 0; attempt < MAX_DETOUR_ATTEMPTS; attempt++) {
    if (Math.abs(best.distanceM - legTargetM) / legTargetM < DETOUR_CLOSE_ENOUGH) break
    const filter = (edge: GraphEdge, fromNodeId: number) => {
      if (baseFilter && !baseFilter(edge)) return false
      return !excluded.has(edgeKey(fromNodeId, edge.to))
    }
    const alt = runLegDijkstra(network, startNodeId, endNodeId, legDijkstraBudgetM(from, to, legTargetM), filter)
    if (!alt) break // nessuna via alternativa esiste proprio: quella trovata finora resta la migliore
    if (Math.abs(alt.distanceM - legTargetM) < Math.abs(best.distanceM - legTargetM)) best = alt
    // Si accumulano gli archi di OGNI tentativo (non solo del migliore): il prossimo giro deve
    // esplorare qualcosa di ancora diverso, non ripiegare sulla stessa alternativa già scartata.
    Array.from(edgeKeysOfPath(alt.nodeIds)).forEach(k => excluded.add(k))
  }
  return best
}

export interface MultiStopLeg {
  fromStopIdx: number
  toStopIdx: number
  distanceM: number
  polyline: [number, number][]
  // false quando non è stato trovato un cammino reale (tappa isolata dalla rete, o nessun percorso
  // entro il budget di ricerca) — il tratto è allora una linea d'aria di ripiego, MAI spacciata per
  // reale: va sempre segnalata all'utente (stesso principio di app/api/borgo-itinerary/route.ts's
  // ItineraryLeg.real), mai nascosta dietro un esito che sembra completo senza esserlo.
  real: boolean
  fallbackReason?: 'too_far_from_network' | 'no_path'
}

export interface MultiStopOutcome {
  legs: MultiStopLeg[]
}

function airlineLeg(fromStopIdx: number, toStopIdx: number, from: { lat: number; lon: number }, to: { lat: number; lon: number }, reason: 'too_far_from_network' | 'no_path'): MultiStopLeg {
  return {
    fromStopIdx, toStopIdx,
    distanceM: haversineM(from.lat, from.lon, to.lat, to.lon),
    polyline: [[from.lat, from.lon], [to.lat, to.lon]],
    real: false,
    fallbackReason: reason,
  }
}

interface ResolvedLeg {
  fromStopIdx: number
  toStopIdx: number
  real: boolean
  fallbackReason?: 'too_far_from_network' | 'no_path'
  distanceM: number
  polyline: [number, number][]
  // Presenti solo per una tratta reale — servono all'eventuale ricerca "più vicino al target".
  startNodeId?: number
  endNodeId?: number
  snapDistM?: number
  shortest?: LegSearchResult
}

/**
 * Percorso a piedi che tocca, in sequenza, tutti i punti di `stops` (indice 0 incluso) — sempre un
 * risultato, mai un fallimento totale: una coppia che non si raggiunge ripiega su una linea
 * d'aria per quella sola tratta (`real:false`), le altre restano cammini reali. `targetDistanceM`,
 * opzionale: quando impostato ed è più lungo della somma dei cammini più brevi (fra le sole tratte
 * reali), ogni tratta reale viene ricercata verso una quota proporzionale del target (vedi
 * seekCloserToTarget) invece di restare al minimo — quando non è impostato, o il minimo lo supera
 * già, resta semplicemente il cammino più breve. Una tratta già in ripiego a linea d'aria non
 * partecipa a questa ricerca (niente su cui cercare).
 */
export function buildMultiStopRoute(
  network: WalkNetwork, stops: { lat: number; lon: number }[], mode: MultiStopMode, targetDistanceM?: number | null,
): MultiStopOutcome {
  const resolved: ResolvedLeg[] = []

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    const startNode = nearestGraphNode(network, from.lat, from.lon, SNAP_THRESHOLD_M)
    const endNode = nearestGraphNode(network, to.lat, to.lon, SNAP_THRESHOLD_M)
    if (!startNode || !endNode) {
      resolved.push({ ...airlineLeg(i, i + 1, from, to, 'too_far_from_network') })
      continue
    }

    const shortest = shortestLegPath(network, startNode.nodeId, endNode.nodeId, mode)
    if (!shortest) {
      resolved.push({ ...airlineLeg(i, i + 1, from, to, 'no_path') })
      continue
    }
    resolved.push({
      fromStopIdx: i, toStopIdx: i + 1, real: true,
      distanceM: shortest.distanceM + startNode.distM + endNode.distM,
      polyline: shortest.polyline,
      startNodeId: startNode.nodeId, endNodeId: endNode.nodeId,
      snapDistM: startNode.distM + endNode.distM,
      shortest,
    })
  }

  // Somma solo delle tratte reali: una linea d'aria non è "già abbastanza vicina al target", è
  // semplicemente fuori dalla ricerca — includerla nella somma falserebbe la quota assegnata alle
  // tratte reali.
  const realLegs = resolved.filter(l => l.real)
  const totalShortestM = realLegs.reduce((s, l) => s + l.distanceM, 0)

  const toLeg = (l: ResolvedLeg): MultiStopLeg => ({
    fromStopIdx: l.fromStopIdx, toStopIdx: l.toStopIdx, distanceM: l.distanceM, polyline: l.polyline,
    real: l.real, fallbackReason: l.fallbackReason,
  })

  // Nessun target, o il più breve fra le tratte reali lo raggiunge/supera già: non c'è margine per
  // avvicinarsi di più restando un cammino reale — il più breve resta la risposta.
  if (targetDistanceM == null || targetDistanceM <= totalShortestM || totalShortestM <= 0) {
    return { legs: resolved.map(toLeg) }
  }

  // Riparte il "di più" richiesto proporzionalmente al peso di ciascuna tratta reale (una tratta
  // già più lunga delle altre riceve una quota maggiore del margine, non tutte uguale) e cerca di
  // avvicinarsi a quel target — riparte dal cammino più breve già trovato sopra, nessun nuovo
  // aggancio alla rete né un secondo Dijkstra "a vuoto" per ritrovare la stessa distanza minima.
  const legs: MultiStopLeg[] = resolved.map(l => {
    if (!l.real || !l.shortest || l.startNodeId == null || l.endNodeId == null || l.snapDistM == null) return toLeg(l)
    const legTargetGraphM = Math.max(0, l.distanceM * (targetDistanceM / totalShortestM) - l.snapDistM)
    if (legTargetGraphM <= l.shortest.distanceM) return toLeg(l)
    const closer = seekCloserToTarget(network, l.startNodeId, l.endNodeId, l.shortest, legTargetGraphM, mode)
    return { fromStopIdx: l.fromStopIdx, toStopIdx: l.toStopIdx, distanceM: closer.distanceM + l.snapDistM, polyline: closer.polyline, real: true }
  })

  return { legs }
}
