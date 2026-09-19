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
// Ogni tratta cerca il cammino PREFERITO fra i due punti, non il più breve in assoluto — a parità
// di rilevanza per il target di lunghezza (sotto), fra due tipi di via si preferisce quello più
// sicuro (vedi TIER_COST_MULTIPLIER: strade bianche/secondarie, poi sentieri, infine strade
// urbane/provinciali), restando comunque disposti a usare un tipo penalizzato se è l'unico modo
// di collegare i due punti.
//
// Distanza target: NON semplicemente il cammino preferito fra le tappe — se l'utente ha impostato
// una distanza (e quello preferito è già più corto), si cerca il percorso che vi si avvicina di
// più, non quello minimo. Il cammino preferito resta l'unica scelta quando non c'è un target, o
// quando il target è già raggiunto/superato (non si può accorciare sotto il minimo) — e non si
// applica affatto a una tratta già in ripiego a linea d'aria (niente su cui cercare).
import { nearestGraphNode, type WalkNetwork, type GraphEdge } from './osmGraph'
import { dijkstra, reconstructPath, reconstructNodePath } from './walkRouting'
import { haversineM } from '../geoUtils'

export type MultiStopMode = 'urbano' | 'misto' | 'naturalistico'

// "Trekking urbano": solo le vie di un centro abitato o le strade che collegano un paese all'altro
// — mai un sentiero/tracciato/mulattiera, le stesse esclusioni descritte dall'utente ("deve
// ignorare i sentieri"). `footway` resta escluso insieme a path/track/bridleway/steps: OSM non
// distingue nei tag un marciapiede urbano da un sentiero di campagna, quindi non c'è modo
// affidabile di tenere l'uno ed escludere l'altro. tertiary/secondary sono incluse insieme a
// residential/unclassified: una strada provinciale fra due paesi (tipicamente taggata così, vedi
// WALKABLE_HIGHWAY in osmGraph.ts) è una strada a tutti gli effetti, non un sentiero — escluderla
// dal "trekking urbano" lascerebbe quella modalità priva dell'unico collegamento reale che spesso
// esiste fra due paesi diversi. La rete percorribile fetchata resta comunque la stessa in entrambe
// le modalità, qui si filtra solo in fase di attraversamento del grafo.
const URBAN_ALLOWED_HIGHWAY = new Set(['residential', 'unclassified', 'tertiary', 'secondary'])

function urbanEdgeFilter(edge: GraphEdge): boolean {
  return edge.highway != null && URBAN_ALLOWED_HIGHWAY.has(edge.highway)
}

// Ordine di preferenza fra i tipi di via — mai un'esclusione (quella la fa già urbanEdgeFilter
// sopra, solo per i sentieri in modalità urbana), un PESO: un percorso resta disposto a usare un
// livello penalizzato se è l'unico modo di collegare due punti, semplicemente lo evita quando
// esiste un'alternativa di livello migliore. Nessun classificatore "sentiero/strada" condiviso già
// esisteva nel repo con questa identica suddivisione a 3 livelli (verificato: lib/overpass.ts's
// classifyHighway ha 6 livelli diversi e non è esportato, lib/navigation/escapeEngine.ts's
// TRAIL_HIGHWAY_QUALITY ignora del tutto tertiary/secondary) — introdotto qui apposta.
// - 'quiet' (strade bianche/secondarie non asfaltate — track/unclassified): sicuro/prevedibile.
// - 'trail' (sentieri veri e propri — path/footway/bridleway/steps).
// - 'road' (strade di un centro abitato o che collegano due paesi — residential/tertiary/
//   secondary): trafficabili da veicoli, mai l'ideale per un pedone.
type HighwayTier = 'quiet' | 'trail' | 'road'

function highwayTier(highway: string | undefined): HighwayTier {
  if (highway === 'track' || highway === 'unclassified') return 'quiet'
  if (highway === 'path' || highway === 'footway' || highway === 'bridleway' || highway === 'steps') return 'trail'
  return 'road'
}

// Ordine diverso per modalità — non solo "quali livelli sono ammessi" (isEdgeAllowed se ne occupa
// già, solo per i sentieri in "urbano"), ma la loro priorità relativa:
// - 'urbano'/'misto': strade bianche prima, poi sentieri, infine strade urbane/provinciali — una
//   questione di sicurezza (vie tranquille prima di strade con traffico), l'ordine fra questi due
//   ultimi livelli resta identico in entrambe, "urbano" esclude solo 'trail' del tutto.
// - 'naturalistico': i sentieri vengono preferiti PER PRIMI (il punto di questa modalità), poi lo
//   stesso ordine delle altre per il resto (strade bianche, infine strade urbane/provinciali).
const TIER_COST_MULTIPLIER_BY_MODE: Record<MultiStopMode, Record<HighwayTier, number>> = {
  urbano: { quiet: 1, trail: 1.5, road: 2.5 }, // trail comunque esclusa da urbanEdgeFilter, valore inerte
  misto: { quiet: 1, trail: 1.5, road: 2.5 },
  naturalistico: { trail: 1, quiet: 1.5, road: 2.5 },
}
// Tetto teorico dei moltiplicatori sopra (su TUTTE le modalità) — dà al budget di ricerca (passato
// a dijkstra() in unità di costo, non metri reali una volta che un moltiplicatore è in gioco)
// margine sufficiente a coprire anche un cammino interamente sul livello più penalizzato:
// altrimenti "preferire" vie migliori rischierebbe di nascondere cammini reali che esistono solo
// attraverso il livello peggiore.
const MAX_TIER_MULTIPLIER = Math.max(
  ...Object.values(TIER_COST_MULTIPLIER_BY_MODE).flatMap(m => Object.values(m)),
)

function tierEdgeCost(mode: MultiStopMode, edge: GraphEdge): number {
  return TIER_COST_MULTIPLIER_BY_MODE[mode][highwayTier(edge.highway)]
}

// La distanza REALE di un cammino trovato con dijkstra.ts's `edgeCost` in gioco non è più leggibile
// da `dist` (quello è costo pesato, non metri) — va ricalcolata dalla geometria. Gli archi di
// questo grafo sono già segmenti dritti nodo-nodo (osmGraph.ts's addEdge calcola distM come
// haversine fra i due nodi), quindi la somma delle distanze fra punti consecutivi della polyline
// coincide esattamente con la somma delle distanze reali degli archi percorsi — nessuna
// ricostruzione separata via ID nodo necessaria solo per questo.
function polylineDistanceM(polyline: [number, number][]): number {
  let total = 0
  for (let i = 0; i < polyline.length - 1; i++) {
    total += haversineM(polyline[i][0], polyline[i][1], polyline[i + 1][0], polyline[i + 1][1])
  }
  return total
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
// Budget di nodi per il SOLO tentativo di ripiego di shortestLegPath sotto — quando la ricerca
// pesata per tipo di via (tierEdgeCost) non raggiunge il bersaglio entro DIJKSTRA_MAX_NODES, non
// significa che una connessione reale non esista: un peso (edgeCost) fa esplorare la coda a
// priorità in ordine di COSTO, non di distanza reale, quindi un'area dove il tipo preferito è
// molto denso (es. i sentieri di una riserva naturale, tutti a costo 1) può esaurire il budget di
// nodi restando dentro quell'area, senza mai raggiungere il nodo — magari più vicino in metri reali
// — che porta fuori verso la tappa successiva. Un tentativo senza peso (edgeCost=1 per ogni arco,
// vedi il ripiego in shortestLegPath) esplora invece in ordine di distanza REALE, uscendo da
// un'area densa non appena la si è attraversata, quindi raggiunge un bersaglio più lontano con
// molti meno nodi visitati a parità di area — un budget più alto qui è un margine di sicurezza,
// non il vero motivo per cui il ripiego funziona dove il tentativo pesato non ci riesce.
const DIJKSTRA_FALLBACK_MAX_NODES = 60000

// Quante alternative (oltre al più breve) provare per avvicinarsi al target di lunghezza di UNA
// tratta — ogni tentativo è un intero Dijkstra sulla stessa rete; con l'heap il costo per tentativo
// è basso, ma il numero resta contenuto: è un'euristica ("prova un'altra via", non un ottimo
// garantito), non una ricerca esaustiva di ogni percorso possibile.
const MAX_DETOUR_ATTEMPTS = 3
// Sotto questo scarto relativo dal target, un tentativo è già abbastanza vicino da non valere la
// pena cercarne uno migliore.
const DETOUR_CLOSE_ENOUGH = 0.1

// Budget di ricerca in metri REALI — indipendente dal peso per tipo di via (TIER_COST_MULTIPLIER
// sopra), usato per il confronto col target di lunghezza e per il "quanto è vicino il tentativo
// migliore" di seekCloserToTarget. Va convertito in unità di costo (vedi toCostBudget sotto) solo
// nel punto in cui viene passato a dijkstra() come maxDistM.
function legDijkstraBudgetM(from: { lat: number; lon: number }, to: { lat: number; lon: number }, legTargetM?: number): number {
  const airlineM = haversineM(from.lat, from.lon, to.lat, to.lon)
  const base = Math.max(DIJKSTRA_MIN_DIST_M, airlineM * DIJKSTRA_DIST_MULTIPLIER)
  const withTarget = legTargetM != null ? Math.max(base, legTargetM * 1.3) : base
  return Math.min(DIJKSTRA_MAX_DIST_CAP_M, withTarget)
}

// dijkstra() con `edgeCost` in gioco accumula costo pesato in `dist`, non più metri reali — il suo
// `maxDistM` deve quindi coprire anche il caso peggiore (un cammino interamente sul livello più
// penalizzato), altrimenti la preferenza per vie migliori rischierebbe di far scartare per budget
// un cammino che nella realtà rientrerebbe comunque in legDijkstraBudgetM.
function toCostBudget(realBudgetM: number): number {
  return realBudgetM * MAX_TIER_MULTIPLIER
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

// Esito grezzo di un singolo tentativo Dijkstra, PRIMA di sapere se ha raggiunto il bersaglio —
// `budgetExhausted` distingue "il bersaglio potrebbe comunque esistere, la ricerca si è fermata
// solo perché ha visitato DIJKSTRA_MAX_NODES/DIJKSTRA_FALLBACK_MAX_NODES nodi" (vero limite di
// ricerca) da "la ricerca ha esaurito l'intera rete raggiungibile entro costBudgetM PRIMA di
// arrivare a quel tetto" (nessun cammino esiste in quella rete/bbox, un problema di copertura dati
// o di rete davvero disconnessa, non di budget) — indistinguibili guardando solo `result`, serve a
// LegDiagnostic sotto per orientare l'indagine (vedi §4 punto 2 di
// docs/crea-guida-itinerario-personalizzato-stato.md).
interface LegSearchAttempt { result: LegSearchResult | null; nodesVisited: number; budgetExhausted: boolean }

// `costBudgetM`: già in unità di costo (peso per tipo di via compreso, salvo `plainDistance`) — il
// chiamante decide se e come convertire il budget in metri reali prima di passarlo qui.
// `plainDistance`: true per il ripiego di shortestLegPath sotto — nessun peso per tipo di via
// (edgeCost=1 su ogni arco, `costBudgetM` allora sono metri reali) e un budget di nodi più ampio
// (DIJKSTRA_FALLBACK_MAX_NODES, vedi sopra), mai il comportamento di default.
function runLegDijkstra(
  network: WalkNetwork, startNodeId: number, endNodeId: number, costBudgetM: number,
  isEdgeAllowed: ((edge: GraphEdge, fromNodeId: number) => boolean) | undefined,
  mode: MultiStopMode,
  plainDistance = false,
): LegSearchAttempt {
  const maxNodes = plainDistance ? DIJKSTRA_FALLBACK_MAX_NODES : DIJKSTRA_MAX_NODES
  const edgeCost = plainDistance ? undefined : (edge: GraphEdge) => tierEdgeCost(mode, edge)
  const { dist, prev, visited } = dijkstra(network, startNodeId, costBudgetM, maxNodes, isEdgeAllowed, edgeCost)
  const budgetExhausted = visited.size >= maxNodes
  if (dist.get(endNodeId) == null) return { result: null, nodesVisited: visited.size, budgetExhausted } // solo per verificare la raggiungibilità entro il budget di costo
  const polyline = reconstructPath(network, prev, endNodeId, startNodeId)
  return {
    result: {
      // MAI dist.get(endNodeId): con tierEdgeCost in gioco è un costo pesato, non la distanza reale
      // — ricalcolata dalla geometria (vedi polylineDistanceM).
      distanceM: polylineDistanceM(polyline),
      polyline,
      nodeIds: reconstructNodePath(prev, endNodeId, startNodeId),
    },
    nodesVisited: visited.size,
    budgetExhausted,
  }
}

// Diagnostica interna (MAI mostrata all'utente, solo per il logging server-side in
// app/api/route-build/multi-stop/route.ts) — vedi il commento su LegSearchAttempt sopra.
// `pathSource`: presente solo quando shortestLegPath trova un risultato, dice quale dei due
// tentativi lo ha prodotto — verifica se il ripiego a distanza reale (§3 del doc di stato) scatta
// davvero in produzione, o se resta teorico.
export interface LegDiagnostic {
  pathSource?: 'preferred' | 'distance_fallback'
  preferred: { nodesVisited: number; budgetExhausted: boolean }
  fallback?: { nodesVisited: number; budgetExhausted: boolean }
}

function shortestLegPath(
  network: WalkNetwork, startNodeId: number, endNodeId: number, mode: MultiStopMode,
): { result: LegSearchResult | null; diagnostic: LegDiagnostic } {
  const baseFilter = mode === 'urbano' ? (edge: GraphEdge) => urbanEdgeFilter(edge) : undefined
  const from = network.nodes.get(startNodeId)
  const to = network.nodes.get(endNodeId)
  if (!from || !to) return { result: null, diagnostic: { preferred: { nodesVisited: 0, budgetExhausted: false } } }
  const costBudget = toCostBudget(legDijkstraBudgetM(from, to))
  const preferred = runLegDijkstra(network, startNodeId, endNodeId, costBudget, baseFilter, mode)
  if (preferred.result) {
    return {
      result: preferred.result,
      diagnostic: { pathSource: 'preferred', preferred: { nodesVisited: preferred.nodesVisited, budgetExhausted: preferred.budgetExhausted } },
    }
  }
  // Ripiego: la ricerca pesata per tipo di via non ha raggiunto il bersaglio entro il suo budget —
  // non vuol dire che una connessione reale non esista (vedi il commento su DIJKSTRA_FALLBACK_MAX_
  // NODES sopra), solo che quella ricerca in particolare non l'ha trovata. Un secondo tentativo
  // senza peso (`plainDistance`) esplora per distanza reale invece che per costo — un cammino reale
  // ma non necessariamente sul tipo di via preferito resta sempre meglio di una linea d'aria (vedi
  // il commento in testa al file: "MAI un fallimento completo"). `baseFilter` resta applicato anche
  // qui: in "urbano" un sentiero va comunque escluso per sicurezza, non è mai un compromesso
  // accettabile. Stesso `costBudget` del tentativo pesato (qui in metri reali, senza moltiplicatore
  // in gioco): non ha senso essere più restrittivi in un tentativo pensato per essere l'ultima
  // spiaggia prima della linea d'aria.
  const fallback = runLegDijkstra(network, startNodeId, endNodeId, costBudget, baseFilter, mode, true)
  return {
    result: fallback.result,
    diagnostic: {
      pathSource: fallback.result ? 'distance_fallback' : undefined,
      preferred: { nodesVisited: preferred.nodesVisited, budgetExhausted: preferred.budgetExhausted },
      fallback: { nodesVisited: fallback.nodesVisited, budgetExhausted: fallback.budgetExhausted },
    },
  }
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
    const alt = runLegDijkstra(network, startNodeId, endNodeId, toCostBudget(legDijkstraBudgetM(from, to, legTargetM)), filter, mode).result
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
  // Diagnostica interna (MAI mostrata all'utente, letta solo da app/api/route-build/multi-stop/
  // route.ts per il logging server-side) — assente per 'too_far_from_network' (fallito
  // nearestGraphNode, Dijkstra non è mai partito, niente da diagnosticare). Vedi LegDiagnostic.
  diagnostic?: LegDiagnostic
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
  diagnostic?: LegDiagnostic
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

    const { result: shortest, diagnostic } = shortestLegPath(network, startNode.nodeId, endNode.nodeId, mode)
    if (!shortest) {
      resolved.push({ ...airlineLeg(i, i + 1, from, to, 'no_path'), diagnostic })
      continue
    }
    resolved.push({
      fromStopIdx: i, toStopIdx: i + 1, real: true,
      distanceM: shortest.distanceM + startNode.distM + endNode.distM,
      polyline: shortest.polyline,
      startNodeId: startNode.nodeId, endNodeId: endNode.nodeId,
      snapDistM: startNode.distM + endNode.distM,
      shortest,
      diagnostic,
    })
  }

  // Somma solo delle tratte reali: una linea d'aria non è "già abbastanza vicina al target", è
  // semplicemente fuori dalla ricerca — includerla nella somma falserebbe la quota assegnata alle
  // tratte reali.
  const realLegs = resolved.filter(l => l.real)
  const totalShortestM = realLegs.reduce((s, l) => s + l.distanceM, 0)

  const toLeg = (l: ResolvedLeg): MultiStopLeg => ({
    fromStopIdx: l.fromStopIdx, toStopIdx: l.toStopIdx, distanceM: l.distanceM, polyline: l.polyline,
    real: l.real, fallbackReason: l.fallbackReason, diagnostic: l.diagnostic,
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
