// Legge la rete percorribile OSM (sentieri, tracciati, strade bianche, strade minori) di un bbox
// come un grafo navigabile — a differenza di lib/overpassTrails.ts, che cerca solo relation
// route=hiking per nome, qui servono le way generiche con i node id (non solo la geometria), così
// i nodi condivisi tra way diverse restano visibili come intersezioni reali della rete stradale.
import { fetchOverpass } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import { mapOsmSacScale } from '@/lib/osm/sacScale'

// Tag highway ammessi: sentieri/tracciati/carrarecce (comprese le "strade bianche", tipicamente
// track/unclassified) più residential — necessario perché un punto di partenza scelto in un paese
// (il caso più comune) è spesso collegato ai sentieri veri fuori centro abitato proprio tramite le
// sue strade residenziali: escluderle del tutto (come in una versione precedente, per contenere il
// tempo di risposta di Overpass) lasciava il nodo di partenza agganciato a un frammento di rete
// isolato, senza nessun cammino reale verso nessun altro punto — la generazione falliva sempre,
// non per dati scarsi ma per grafo disconnesso.
// tertiary/secondary aggiunti per lo stesso motivo, un livello più in su: due paesi diversi (non
// un punto di partenza e i sentieri nei dintorni, il caso sopra) sono quasi sempre collegati SOLO
// da una strada provinciale ("SP..."), tipicamente taggata tertiary o secondary in OSM, mai da
// residential/unclassified (che restano interni al singolo paese) né da un sentiero. Escluderli
// lasciava paesi realmente raggiungibili a piedi (la personalizzazione multi-tappa di un Borgo/
// Città, lib/routeBuilder/multiStopRoute.ts, sceglie tappe che sono spesso paesi diversi) senza
// NESSUN arco che li collegasse nel grafo scaricato — non un limite di ricerca (Dijkstra non trova
// un cammino che non è mai stato scaricato), un buco nei dati fetchati. Le strade davvero maggiori
// (motorway/primary/trunk) restano escluse insieme a `service` (accessi/parcheggi interni,
// numerosissimi e non utili) e agli accessi privati/vietati — troppo trafficate per un pedone,
// mai l'unica via reale fra due paesi vicini in area rurale.
// pedestrian/living_street aggiunti per lo stesso identico motivo, stavolta dentro un centro
// storico: una piazza o un vicolo pedonale italiano è quasi sempre taggato così in OSM, MAI
// residential/unclassified — un punto di interesse (Chiesa, palazzo) affacciato su una di queste
// vie restava con l'aggancio alla rete riuscito (un nodo vicino esiste) ma isolato da tutto il
// resto, perché la via che lo collegava al resto del paese non era mai stata scaricata — stesso
// sintomo del buco tertiary/secondary sopra (due punti vicinissimi, "nessun cammino trovato", non
// "troppo lontano dalla rete"), stavolta all'interno di un solo centro abitato invece che fra due.
const WALKABLE_HIGHWAY = 'path|track|footway|bridleway|steps|unclassified|residential|tertiary|secondary|pedestrian|living_street'

// Il filtro sul tag `access` da solo esclude in blocco anche le vie di una Zona a Traffico
// Limitato taggate `access=private` (comune per le ZTL dei centri storici) — un tag che per
// convenzione OSM si applica di default A TUTTI i modi di trasporto, pedoni compresi, ma che nella
// pratica i mappatori italiani usano quasi sempre per restringere SOLO i veicoli (l'accesso
// pedonale a una ZTL è quasi sempre libero). Un router pedonale deve quindi guardare il tag `foot`
// quando presente — più specifico, prevale sempre su `access` per convenzione OSM — e ripiegare su
// `access` solo quando `foot` non è taggato affatto: unione di due filtri invece di uno solo,
// Overpass QL non supporta un "coalesce" fra tag in un singolo filtro.
const WALKABLE_ACCESS_FILTER =
  '["access"!~"^(private|no)$"]["foot"!~"^(private|no)$"]'
const WALKABLE_FOOT_OVERRIDE_FILTER = '["foot"~"^(yes|permissive|designated)$"]'

// Bump ad ogni cambio della query stessa (WALKABLE_HIGHWAY, i filtri di accesso sopra, o
// qualunque altro filtro dentro fetchWalkNetwork sotto) — lib/routeBuilder/walkNetworkCache.ts lo
// include nella chiave di cache proprio perché la chiave è altrimenti solo il bbox: senza questo,
// una rete già in cache da PRIMA di un cambio di filtro (es. l'aggiunta di tertiary/secondary, o
// di pedestrian/living_street sopra) resterebbe servita così com'era, con lo stesso identico buco
// nei dati che il cambio doveva risolvere, fino alla scadenza naturale della cache (45gg) — un fix
// silenziosamente inefficace per qualunque bbox già visitato.
export const WALK_NETWORK_QUERY_VERSION = 3

export interface GraphNode {
  lat: number
  lon: number
  edges: GraphEdge[]
  /** Quota reale (m), popolata best-effort dopo il fetch (Fase 7 di
   *  docs/navigator-orizzonti-roadmap.md, lib/dtm/graphElevation.ts) — assente su un nodo appena
   *  scaricato o su un grafo persistito prima di questa fase. Mai richiesta al momento del
   *  fetch stesso: il DTM è rate-limited, va cache-ata una volta sola a valle. */
  elevM?: number
}

export interface GraphEdge {
  to: number
  distM: number
  wayId: number
  highway?: string
  // DTREK-AUDIT.md P0 #10 — già presenti sui tag della way scaricata per il grafo (nessuna nuova
  // query Overpass), semplicemente mai letti finora oltre a `highway`. sacScale è già mappato a
  // T1-T6 (vedi lib/osm/sacScale.ts), non il valore OSM grezzo.
  sacScale?: string
  ford?: boolean
}

export interface WalkNetwork {
  nodes: Map<number, GraphNode>
}

interface OverpassNodeEl {
  type: 'node'
  id: number
  lat: number
  lon: number
}

interface OverpassWayEl {
  type: 'way'
  id: number
  nodes: number[]
  tags?: Record<string, string>
}

type OverpassEl = OverpassNodeEl | OverpassWayEl

function addEdge(nodes: Map<number, GraphNode>, fromId: number, toId: number, wayId: number, highway?: string, sacScale?: string, ford?: boolean) {
  const from = nodes.get(fromId)
  const to = nodes.get(toId)
  if (!from || !to) return
  const distM = haversineM(from.lat, from.lon, to.lat, to.lon)
  if (distM <= 0) return
  from.edges.push({ to: toId, distM, wayId, highway, sacScale, ford })
  to.edges.push({ to: fromId, distM, wayId, highway, sacScale, ford })
}

/**
 * Scarica ed espande in un grafo in memoria la rete percorribile in un bbox
 * [minLat, minLon, maxLat, maxLon]. Ogni way viene spezzata negli archi tra i suoi node
 * consecutivi — i node condivisi da più way (le intersezioni reali sul terreno) collegano
 * automaticamente i due tratti, senza bisogno di calcoli geometrici di prossimità.
 */
// `timeoutMs`, opzionale: il chiamante sceglie in base al proprio budget residuo (vedi
// maxDuration del proprio endpoint) — 18s per default, il valore storico condiviso da tutti i
// chiamanti finché era l'unico usato (app/api/route-build/route.ts, che a valle deve ancora
// lasciare margine a pathfinding e arricchimento DTM/POI). app/api/borgo-itinerary/route.ts non
// ha stage pesanti a valle (solo Dijkstra per tappa, già limitato da DIJKSTRA_MAX_NODES) e passa
// un valore più alto: un fetch a freddo di questa query, quella più lenta e più spesso causa di
// ripiego su linee d'aria, ha così più margine per riuscire prima di arrendersi.
export async function fetchWalkNetwork(bbox: [number, number, number, number], timeoutMs = 18_000): Promise<WalkNetwork> {
  const [minLat, minLon, maxLat, maxLon] = bbox
  // DTREK-AUDIT.md P0 #10 — "out skel qt" (verbosità precedente) NON include mai i tag delle way,
  // solo id/skeleton: el.tags?.highway era quindi sempre undefined, e con esso anche
  // pathHasSteps/hasSteps (bug preesistente, mai notato perché "nessuno scalino rilevato" è
  // indistinguibile da "davvero nessuno scalino" senza guardare il codice). "out body qt" include
  // i tag — stessa identica combinazione filtro/bbox già usata con successo in produzione da
  // lib/routeBuilder/hikingProbability.ts::fetchTaggedNetwork (lì con [timeout:25] anziché 18, ma
  // il costo lato server di trovare le way corrispondenti è identico: cambia solo la
  // serializzazione/il trasferimento, non la ricerca) — stesso pattern, non una query nuova. Il
  // tetto lato server della query segue timeoutMs (in secondi, arrotondato per difetto) invece di
  // un valore fisso, così il client non chiude la connessione prima che Overpass stesso rinunci.
  // Union di due filtri (vedi WALKABLE_ACCESS_FILTER/WALKABLE_FOOT_OVERRIDE_FILTER sopra) invece
  // di un solo `way[...]`: la seconda metà recupera le vie che la prima esclude per `access`
  // generico ma che un tag `foot` esplicito rende comunque percorribili a piedi (le ZTL dei centri
  // storici, tipicamente). `(._;>;);` sotto funziona identico su una union di più way — stessa
  // sintassi già usata per un singolo statement, Overpass la accetta indifferentemente.
  const query = `[out:json][timeout:${Math.floor(timeoutMs / 1000)}][maxsize:536870912];
(
way["highway"~"^(${WALKABLE_HIGHWAY})$"]${WALKABLE_ACCESS_FILTER}(${minLat},${minLon},${maxLat},${maxLon});
way["highway"~"^(${WALKABLE_HIGHWAY})$"]${WALKABLE_FOOT_OVERRIDE_FILTER}(${minLat},${minLon},${maxLat},${maxLon});
);
(._;>;);
out body qt;`

  // Timeout client allineato al [timeout:] della query — fetchOverpass ritenta una volta sola
  // dopo una breve pausa (vedi lib/overpassTrails.ts), quindi il caso peggiore resta ~2×timeoutMs
  // invece di superare da solo il budget della funzione chiamante (maxDuration del proprio
  // endpoint, con margine per il resto della pipeline a valle).
  const json = await fetchOverpass<{ elements: OverpassEl[]; remark?: string }>(query, timeoutMs)
  const elements = json.elements ?? []
  // `remark` compare SOLO quando Overpass stesso ha interrotto la query prima di finirla (di
  // solito perché ha raggiunto il proprio `[timeout:...]` interno) — la risposta resta comunque
  // HTTP 200 con qualunque elemento raccolto fino a quel momento, quindi `fetchOverpass` sopra non
  // la vede come un errore: un fallimento silenzioso, rete parziale servita come se fosse completa.
  // Nessun modo affidabile di distinguere qui "parziale ma sufficiente per il bbox richiesto" da
  // "parziale e con un buco proprio dove serviva" — solo segnalarlo, non correggerlo: vedi §4 punto
  // 3 di docs/crea-guida-itinerario-personalizzato-stato.md, una causa plausibile di "nessun
  // cammino trovato" che il ripiego a distanza reale in multiStopRoute.ts non risolverebbe (la rete
  // su cui cerca è quella incompleta).
  if (json.remark) {
    console.warn('[osmGraph] risposta Overpass parziale/incompleta per bbox', bbox, '-', json.remark)
  }

  const nodes = new Map<number, GraphNode>()
  for (const el of elements) {
    if (el.type === 'node') nodes.set(el.id, { lat: el.lat, lon: el.lon, edges: [] })
  }

  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes || el.nodes.length < 2) continue
    const sacScale = mapOsmSacScale(el.tags?.sac_scale) ?? undefined
    // "no" è un valore esplicito valido per il tag ford (nessun guado) — solo qualunque altro
    // valore presente (yes, stepping_stones, ...) conta come guado reale.
    const ford = el.tags?.ford != null && el.tags.ford !== 'no'
    for (let i = 0; i < el.nodes.length - 1; i++) {
      addEdge(nodes, el.nodes[i], el.nodes[i + 1], el.id, el.tags?.highway, sacScale, ford)
    }
  }

  return { nodes }
}

/** Nodo del grafo più vicino a (lat, lon), entro thresholdM — null se la rete è vuota o troppo lontana. */
export function nearestGraphNode(
  network: WalkNetwork,
  lat: number,
  lon: number,
  thresholdM = 400,
): { nodeId: number; distM: number } | null {
  let best: { nodeId: number; distM: number } | null = null
  for (const [nodeId, node] of Array.from(network.nodes)) {
    const distM = haversineM(lat, lon, node.lat, node.lon)
    if (distM <= thresholdM && (!best || distM < best.distM)) best = { nodeId, distM }
  }
  return best
}

/**
 * Un tratto contratto della rete, da un'intersezione reale alla successiva — per l'editor manuale
 * dei percorsi (app/api/walk-network-segments/route.ts), dove un click deve selezionare "tutta la
 * strada fino al prossimo incrocio", non un singolo arco fra due nodi consecutivi della stessa way
 * (il grafo grezzo ne avrebbe decine anche per un tratto dritto). `wayId`/`highway` riportano solo
 * il PRIMO arco del tratto: un tratto può in teoria attraversare un cambio di way OSM senza un vero
 * incrocio (una way spezzata in due dai mappatori senza motivo topologico) — qui serve solo come
 * etichetta indicativa, mai per la geometria stessa.
 */
export interface NetworkSegment {
  id: string
  points: [number, number][]
  wayId: number
  highway?: string
}

/**
 * Contrae un WalkNetwork in NetworkSegment intersezione-intersezione: un nodo è un'intersezione se
 * ha un numero di archi diverso da 2 (una vera diramazione, o l'estremità di un ramo cieco) — da
 * ogni arco uscente da un'intersezione si cammina lungo nodi di grado 2 finché non se ne incontra
 * un'altra. Ogni arco (fisico, non le due metà bidirezionali con cui è memorizzato in WalkNetwork)
 * viene emesso una sola volta.
 *
 * Un secondo giro raccoglie i cicli isolati senza NESSUNA intersezione (un anello completo di soli
 * nodi di grado 2, raro ma possibile) — altrimenti il primo giro, che parte solo da intersezioni
 * reali, li salterebbe interamente: nessun nodo del ciclo farebbe mai da punto di partenza.
 */
export function buildNetworkSegments(network: WalkNetwork): NetworkSegment[] {
  const segments: NetworkSegment[] = []
  const visited = new Set<string>()
  const isJunction = (id: number) => (network.nodes.get(id)?.edges.length ?? 0) !== 2
  const edgeKey = (a: number, b: number, wayId: number) => (a < b ? `${a}|${b}|${wayId}` : `${b}|${a}|${wayId}`)

  function walkFrom(startNodeId: number, startEdge: GraphEdge) {
    const startNode = network.nodes.get(startNodeId)
    let curNode = network.nodes.get(startEdge.to)
    if (!startNode || !curNode) return
    visited.add(edgeKey(startNodeId, startEdge.to, startEdge.wayId))

    const points: [number, number][] = [[startNode.lat, startNode.lon], [curNode.lat, curNode.lon]]
    const { wayId, highway } = startEdge
    let prevNodeId = startNodeId
    let curId = startEdge.to

    // Si ferma a una vera intersezione, oppure tornando al nodo di partenza stesso (chiusura di un
    // ciclo isolato senza intersezioni — vedi il secondo giro sotto).
    while (!isJunction(curId) && curId !== startNodeId) {
      const backEdge = curNode.edges.find(e => e.to === prevNodeId)
      const forwardEdge = curNode.edges.find(e => e !== backEdge)
      if (!forwardEdge) break
      const nextNode = network.nodes.get(forwardEdge.to)
      if (!nextNode) break
      visited.add(edgeKey(curId, forwardEdge.to, forwardEdge.wayId))
      points.push([nextNode.lat, nextNode.lon])
      prevNodeId = curId
      curId = forwardEdge.to
      curNode = nextNode
    }

    segments.push({ id: `${wayId}:${segments.length}`, points, wayId, highway })
  }

  for (const [nodeId, node] of Array.from(network.nodes)) {
    if (!isJunction(nodeId)) continue
    for (const edge of node.edges) {
      if (visited.has(edgeKey(nodeId, edge.to, edge.wayId))) continue
      walkFrom(nodeId, edge)
    }
  }

  // Cicli isolati: ogni arco rimasto non visitato appartiene per forza a una componente senza
  // nessuna intersezione — il nodo di partenza scelto qui è un taglio arbitrario, non un'intersezione
  // reale (non ce ne sono), solo per rendere il ciclo comunque selezionabile come un tratto.
  for (const [nodeId, node] of Array.from(network.nodes)) {
    for (const edge of node.edges) {
      if (visited.has(edgeKey(nodeId, edge.to, edge.wayId))) continue
      walkFrom(nodeId, edge)
    }
  }

  return segments
}
