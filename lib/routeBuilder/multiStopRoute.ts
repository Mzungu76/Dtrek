// Itinerario a piedi che deve toccare TUTTE le tappe scelte dall'utente, nell'ordine di selezione
// — a differenza di app/api/borgo-itinerary/route.ts (itinerario automatico passivo, tappe
// scoperte in autonomia e ordinate a vicino-più-vicino, con un ripiego a linea d'aria per una
// tappa isolata), questa è una generazione DELIBERATA: l'utente ha scelto a mano quali punti
// toccare, quindi un tratto irraggiungibile non deve mai degradare silenziosamente a linea
// d'aria — va dichiarato esplicitamente, per coppia di tappe, così l'utente può aggiustare la
// selezione (rimuovere quella tappa, cambiare urbano/misto) invece di ricevere un risultato che
// sembra completo ma non lo è. Puro (nessun import Supabase/Overpass), stesso livello di
// lib/routeBuilder/loopBuilder.ts — chi chiama fornisce già il WalkNetwork.
//
// Distanza target: NON semplicemente il cammino più breve fra le tappe — se l'utente ha impostato
// una distanza (e il più breve è già più corto), si cerca il percorso che vi si avvicina di più,
// non quello minimo. Il più breve resta l'unica scelta quando non c'è un target, o quando il
// target è già raggiunto/superato dal più breve (non si può accorciare sotto il minimo).
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
// doppio o il triplo della distanza in linea d'aria. Un tetto fisso troppo basso interrompeva
// Dijkstra prima di trovare un cammino che esisteva davvero nella rete già scaricata — un
// fallimento evitabile, non un limite reale del terreno. Il budget ora scala con quanto sono
// distanti le due tappe, con un pavimento (tratte brevi restano comunque ben servite) e un tetto
// di sicurezza (costo di Dijkstra/tempo di risposta, mai oltre MAX_TARGET_DISTANCE_KM
// dell'intera app, 15km — buildConstants.ts).
const DIJKSTRA_MIN_DIST_M = 8000
const DIJKSTRA_MAX_DIST_CAP_M = 20000
const DIJKSTRA_DIST_MULTIPLIER = 3
// Alzato in proporzione al budget di distanza più ampio sopra — una rete più estesa da esplorare
// richiede più nodi visitabili prima di arrendersi, altrimenti il nuovo tetto di distanza non ha
// mai la possibilità di essere raggiunto.
const DIJKSTRA_MAX_NODES = 6000

// Quante alternative (oltre al più breve) provare per avvicinarsi al target di lunghezza di UNA
// tratta — ogni tentativo è un intero Dijkstra sulla stessa rete, il costo cresce linearmente con
// questo numero, quindi resta basso: è un'euristica ("prova un'altra via", non un ottimo
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
}

export interface MultiStopFailedLeg {
  fromStopIdx: number
  toStopIdx: number
  reason: 'too_far_from_network' | 'no_path'
}

export type MultiStopOutcome =
  | { ok: true; legs: MultiStopLeg[] }
  | { ok: false; failedLegs: MultiStopFailedLeg[] }

/**
 * Percorso a piedi che tocca, in sequenza, tutti i punti di `stops` (indice 0 incluso) — MAI un
 * ripiego a linea d'aria: una coppia che non si raggiunge finisce in `failedLegs` e si continua
 * comunque a verificare le altre, così un solo tentativo elenca tutti i collegamenti mancanti
 * invece di fermarsi al primo. `targetDistanceM`, opzionale: quando impostato ed è più lungo della
 * somma dei cammini più brevi, ogni tratta viene ricercata verso una quota proporzionale del
 * target (vedi seekCloserToTarget) invece di restare al minimo — quando non è impostato, o il
 * minimo lo supera già, resta semplicemente il cammino più breve per ogni tratta.
 */
interface ResolvedLeg {
  fromStopIdx: number
  toStopIdx: number
  startNodeId: number
  endNodeId: number
  snapDistM: number // startNode.distM + endNode.distM, il tratto di aggancio dal punto esatto al nodo di rete
  shortest: LegSearchResult
}

export function buildMultiStopRoute(
  network: WalkNetwork, stops: { lat: number; lon: number }[], mode: MultiStopMode, targetDistanceM?: number | null,
): MultiStopOutcome {
  const failedLegs: MultiStopFailedLeg[] = []
  const resolved: ResolvedLeg[] = []

  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    const startNode = nearestGraphNode(network, from.lat, from.lon, SNAP_THRESHOLD_M)
    const endNode = nearestGraphNode(network, to.lat, to.lon, SNAP_THRESHOLD_M)
    if (!startNode || !endNode) {
      failedLegs.push({ fromStopIdx: i, toStopIdx: i + 1, reason: 'too_far_from_network' })
      continue
    }

    const shortest = shortestLegPath(network, startNode.nodeId, endNode.nodeId, mode)
    if (!shortest) {
      failedLegs.push({ fromStopIdx: i, toStopIdx: i + 1, reason: 'no_path' })
      continue
    }
    resolved.push({
      fromStopIdx: i, toStopIdx: i + 1,
      startNodeId: startNode.nodeId, endNodeId: endNode.nodeId,
      snapDistM: startNode.distM + endNode.distM,
      shortest,
    })
  }

  if (failedLegs.length > 0) return { ok: false, failedLegs }

  const totalShortestM = resolved.reduce((s, l) => s + l.shortest.distanceM + l.snapDistM, 0)

  // Nessun target, o il più breve lo raggiunge/supera già: non c'è margine per avvicinarsi di più
  // restando un cammino reale — il più breve resta la risposta.
  if (targetDistanceM == null || targetDistanceM <= totalShortestM || totalShortestM <= 0) {
    return {
      ok: true,
      legs: resolved.map(l => ({
        fromStopIdx: l.fromStopIdx, toStopIdx: l.toStopIdx,
        distanceM: l.shortest.distanceM + l.snapDistM, polyline: l.shortest.polyline,
      })),
    }
  }

  // Riparte il "di più" richiesto proporzionalmente al peso di ciascuna tratta (una tratta già più
  // lunga delle altre riceve una quota maggiore del margine, non tutte uguale) e cerca di
  // avvicinarsi a quel target — riparte dal cammino più breve già trovato sopra, nessun nuovo
  // aggancio alla rete né un secondo Dijkstra "a vuoto" per ritrovare la stessa distanza minima.
  const legs: MultiStopLeg[] = resolved.map(l => {
    const legDistanceM = l.shortest.distanceM + l.snapDistM
    // Il target si riferisce alla tratta intera (compreso l'aggancio dal punto esatto alla rete),
    // ma seekCloserToTarget cerca solo la parte "sulla rete" (fra i due nodi agganciati) — sottratto
    // l'aggancio (fisso, indipendente da quale variante di percorso si sceglie) prima di confrontarlo.
    const legTargetGraphM = Math.max(0, legDistanceM * (targetDistanceM / totalShortestM) - l.snapDistM)
    if (legTargetGraphM <= l.shortest.distanceM) {
      return { fromStopIdx: l.fromStopIdx, toStopIdx: l.toStopIdx, distanceM: legDistanceM, polyline: l.shortest.polyline }
    }
    const closer = seekCloserToTarget(network, l.startNodeId, l.endNodeId, l.shortest, legTargetGraphM, mode)
    return { fromStopIdx: l.fromStopIdx, toStopIdx: l.toStopIdx, distanceM: closer.distanceM + l.snapDistM, polyline: closer.polyline }
  })

  return { ok: true, legs }
}
