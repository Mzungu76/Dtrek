// Legge la rete percorribile OSM (sentieri, tracciati, strade bianche, strade minori) di un bbox
// come un grafo navigabile — a differenza di lib/overpassTrails.ts, che cerca solo relation
// route=hiking per nome, qui servono le way generiche con i node id (non solo la geometria), così
// i nodi condivisi tra way diverse restano visibili come intersezioni reali della rete stradale.
import { fetchOverpass } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'
import { mapOsmSacScale } from '@/lib/osm/sacScale'

// Tag highway ammessi per un percorso escursionistico: sentieri/tracciati/carrarecce (comprese le
// "strade bianche", tipicamente track/unclassified) più residential — necessario perché un punto
// di partenza scelto in un paese (il caso più comune) è spesso collegato ai sentieri veri fuori
// centro abitato proprio tramite le sue strade residenziali: escluderle del tutto (come in una
// versione precedente, per contenere il tempo di risposta di Overpass) lasciava il nodo di
// partenza agganciato a un frammento di rete isolato, senza nessun cammino reale verso nessun
// altro punto — la generazione falliva sempre, non per dati scarsi ma per grafo disconnesso.
// `service` resta escluso (accessi/parcheggi interni, numerosissimi e non utili per un percorso
// escursionistico) insieme ai tag stradali maggiori (motorway/primary/secondary/trunk) e agli
// accessi privati/vietati.
const WALKABLE_HIGHWAY = 'path|track|footway|bridleway|steps|unclassified|residential'

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
export async function fetchWalkNetwork(bbox: [number, number, number, number]): Promise<WalkNetwork> {
  const [minLat, minLon, maxLat, maxLon] = bbox
  // DTREK-AUDIT.md P0 #10 — "out skel qt" (verbosità precedente) NON include mai i tag delle way,
  // solo id/skeleton: el.tags?.highway era quindi sempre undefined, e con esso anche
  // pathHasSteps/hasSteps (bug preesistente, mai notato perché "nessuno scalino rilevato" è
  // indistinguibile da "davvero nessuno scalino" senza guardare il codice). "out body qt" include
  // i tag — stessa identica combinazione filtro/bbox già usata con successo in produzione da
  // lib/routeBuilder/hikingProbability.ts::fetchTaggedNetwork (lì con [timeout:25] anziché 18, ma
  // il costo lato server di trovare le way corrispondenti è identico: cambia solo la
  // serializzazione/il trasferimento, non la ricerca) — stesso pattern, non una query nuova.
  const query = `[out:json][timeout:18][maxsize:536870912];
way["highway"~"^(${WALKABLE_HIGHWAY})$"]["access"!~"^(private|no)$"](${minLat},${minLon},${maxLat},${maxLon});
(._;>;);
out body qt;`

  // Timeout client allineato al [timeout:18] della query — fetchOverpass ritenta una volta sola
  // dopo una breve pausa (vedi lib/overpassTrails.ts), quindi il caso peggiore resta ~37s invece
  // di superare da solo il budget della funzione (maxDuration=60 su app/api/route-build/route.ts,
  // che deve lasciare margine anche per pathfinding e arricchimento DTM/POI a valle).
  const json = await fetchOverpass<{ elements: OverpassEl[] }>(query, 18_000)
  const elements = json.elements ?? []

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
