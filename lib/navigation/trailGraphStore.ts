/**
 * Persists the walkable trail graph (lib/routeBuilder/osmGraph.ts) for one
 * hike, keyed by hikeId, in IndexedDB alongside everything else in
 * lib/localStore.ts. This is the prerequisite the roadmap calls out for
 * Fase 4 (Map Matching against real alternatives, not just the single
 * planned polyline), Fase 6 (Offline Navigation Package) and Fase 7 (Escape
 * Engine — needs the surrounding network, not just the route): today
 * `fetchWalkNetwork` only runs once, over the network, during route
 * planning, and the result is never kept — unusable offline and gone by the
 * time the hiker is actually navigating.
 *
 * This module only fetches and stores the graph; it does not (yet) decide
 * how Map Matching or the Escape Engine use it — those are separate,
 * later phases.
 */
import { lsGet, lsSet, lsDel } from '@/lib/localStore'
import { computeBbox } from '@/lib/geoUtils'
import { fetchWalkNetwork, type WalkNetwork, type GraphNode } from '@/lib/routeBuilder/osmGraph'

const TRAIL_GRAPH_KEY = (hikeId: string) => `trail-graph:${hikeId}`

/** IndexedDB-friendly shape — a Map doesn't round-trip through the rest of this codebase's plain-JSON storage conventions (packageManifest.ts, plannedStore.ts, etc.), so entries are stored as an array and rebuilt into a Map on load. */
interface StoredTrailGraph {
  hikeId: string
  fetchedAt: number
  nodeCount: number
  nodes: [number, GraphNode][]
}

function toStored(hikeId: string, network: WalkNetwork): StoredTrailGraph {
  const nodes = Array.from(network.nodes.entries())
  return { hikeId, fetchedAt: Date.now(), nodeCount: nodes.length, nodes }
}

function fromStored(stored: StoredTrailGraph): WalkNetwork {
  return { nodes: new Map(stored.nodes) }
}

export async function saveTrailGraph(hikeId: string, network: WalkNetwork): Promise<void> {
  await lsSet(TRAIL_GRAPH_KEY(hikeId), toStored(hikeId, network))
}

export async function loadTrailGraph(hikeId: string): Promise<WalkNetwork | null> {
  const stored = await lsGet<StoredTrailGraph>(TRAIL_GRAPH_KEY(hikeId))
  return stored ? fromStored(stored) : null
}

export async function deleteTrailGraph(hikeId: string): Promise<void> {
  await lsDel(TRAIL_GRAPH_KEY(hikeId))
}

export async function hasTrailGraph(hikeId: string): Promise<boolean> {
  return (await lsGet<StoredTrailGraph>(TRAIL_GRAPH_KEY(hikeId))) != null
}

export interface FetchTrailGraphResult {
  network: WalkNetwork
  nodeCount: number
}

/**
 * Fetches the walkable network around a route (Overpass, same source as
 * route planning) and persists it for this hike. The bbox uses
 * lib/geoUtils.ts's default ~1.1km padding — wider than the offline tile
 * package's ~300m buffer (lib/offline/packageManager.ts), deliberately:
 * an escape route or a nearby alternative trail is often well outside the
 * immediate route corridor, not just outside the visible map tiles.
 *
 * Best-effort by design: callers (offline package download, navigation
 * start) should treat a thrown error here as "no graph available this
 * time", not as a reason to fail the surrounding operation — Overpass is a
 * shared public service and can be slow/unavailable, and Map
 * Matching/Escape Engine both already degrade to "just the planned route"
 * without this data (that's the current, working behavior).
 */
export async function fetchAndSaveTrailGraph(hikeId: string, routePolyline: [number, number][]): Promise<FetchTrailGraphResult> {
  const bbox = computeBbox(routePolyline).split(',').map(Number) as [number, number, number, number]
  const network = await fetchWalkNetwork(bbox)
  await saveTrailGraph(hikeId, network)
  return { network, nodeCount: network.nodes.size }
}

/** Fetches+saves only if this hike doesn't already have a persisted graph — the common case for both the offline download and the navigation-start prefetch, neither of which should re-hit Overpass on every call. */
export async function ensureTrailGraph(hikeId: string, routePolyline: [number, number][]): Promise<FetchTrailGraphResult | null> {
  const existing = await loadTrailGraph(hikeId)
  if (existing) return { network: existing, nodeCount: existing.nodes.size }
  try {
    return await fetchAndSaveTrailGraph(hikeId, routePolyline)
  } catch {
    return null
  }
}

/**
 * Fase 7 di docs/navigator-orizzonti-roadmap.md — applica le quote ricevute da
 * lib/dtm/graphElevation.ts (via app/api/navigation/trail-graph-elevation) al grafo già
 * persistito, poi lo risalva. Best-effort by design come fetchAndSaveTrailGraph sopra: un no-op
 * silenzioso se il grafo non esiste più (cancellato tra il fetch e questa chiamata) o se non
 * c'è nulla da applicare — non solleva mai un errore che possa far fallire un pacchetto offline
 * altrimenti completo.
 */
export async function applyElevationsToTrailGraph(hikeId: string, elevations: Map<number, number>): Promise<void> {
  if (elevations.size === 0) return
  const network = await loadTrailGraph(hikeId)
  if (!network) return
  // Array.from(...) invece di for...of diretto su Map — stesso downlevelIteration già aggirato
  // altrove nel repo (es. escapeEngine.ts's dijkstra()).
  for (const [nodeId, elevM] of Array.from(elevations)) {
    const node = network.nodes.get(nodeId)
    if (node) node.elevM = elevM
  }
  await saveTrailGraph(hikeId, network)
}
