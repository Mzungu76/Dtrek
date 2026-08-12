/**
 * Escape Engine (spec §11) — Dtrek's distinctive feature: when the route is
 * lost, blocked, or looks unreliable, don't just say OFF_ROUTE. Search the
 * persisted trail graph (lib/navigation/trailGraphStore.ts, built on top of
 * lib/routeBuilder/osmGraph.ts) for real ways out, and explain why each one
 * is being proposed — never a bare distance number with no reasoning.
 *
 * Deliberately on-demand, not run per-fix: this does a graph search (up to
 * a few hundred nodes), which is cheap once but wasteful to repeat every
 * GPS update. The caller (a UI action, "trova una via d'uscita") re-invokes
 * it when the hiker actually wants options, not continuously.
 *
 * What this does NOT do (see docs/navigation-engine-roadmap.md for why):
 * no elevation/dislivello per candidate — the DTM lookup pipeline
 * (lib/dtm/) needs a network round trip against a rate-limited external
 * API (50 calls/24h) per lib/dtm/dtmCache.ts, not something to spend on a
 * live in-navigation decision. Safety here is estimated from path length,
 * OSM highway classification, and (for POIs) category — a real but
 * intentionally coarser signal than a full trail-score analysis.
 */
import { haversineM, bearingDeg, minDistToTrack } from '@/lib/geoUtils'
import type { WalkNetwork } from '@/lib/routeBuilder/osmGraph'
import { nearestGraphNode } from '@/lib/routeBuilder/osmGraph'
import type { NavPoi, RouteProgress } from './types'

export type EscapeSafety = 'alta' | 'media' | 'bassa'
export type EscapeOptionKind = 'back_to_route' | 'alternative_trail' | 'road' | 'safe_poi'

export interface EscapeOption {
  kind: EscapeOptionKind
  label: string
  distanceM: number
  safety: EscapeSafety
  /** Always populated — spec §11: "L'utente deve sempre sapere perché viene proposta una determinata opzione." */
  reason: string
  /** Straight-line compass bearing from the current position toward the target — for a "head this way" arrow. */
  bearingDeg: number
  targetLat: number
  targetLon: number
  /** Node-by-node path through the trail graph, when found that way (alternative_trail/road) — null for back_to_route (direct line to the planned route) and safe_poi (straight-line only; no path search attempted against POIs). */
  path: [number, number][] | null
}

export interface EscapeEngineInput {
  /** Persisted trail graph for this hike (lib/navigation/trailGraphStore.ts) — null/absent is handled gracefully (graph-dependent options are simply omitted; back_to_route never depends on it). */
  network: WalkNetwork | null
  routePolyline: [number, number][]
  currentLat: number
  currentLon: number
  /** Current RouteTracker progress — reused for the nearest-point-on-route figure instead of recomputing it. */
  progress: RouteProgress
  pois?: NavPoi[]
}

const SAFE_POI_TYPES = new Set(['hut', 'bivouac', 'shelter'])
const ROAD_HIGHWAYS = new Set(['unclassified', 'residential'])
/** Rough "how substantial is this path" ranking among the trail-like highway tags osmGraph.ts's WALKABLE_HIGHWAY already filtered to — track/footway read as more established than a narrow path, bridleway or steps. */
const TRAIL_HIGHWAY_QUALITY: Record<string, number> = { track: 3, footway: 2, path: 2, bridleway: 1, steps: 1 }

const MAX_SEARCH_RADIUS_M = 2000
const MAX_VISITED_NODES = 600
/** A graph node this close to the planned route isn't a genuine alternative — it's the same route (or a cartographic duplicate of it), so candidates within this distance are skipped rather than proposed as an "escape". */
const MIN_ALTERNATIVE_DISTANCE_FROM_ROUTE_M = 40
const MAX_SAFE_POI_DISTANCE_M = 3000

interface DijkstraResult {
  dist: Map<number, number>
  prev: Map<number, number>
  viaHighway: Map<number, string | undefined>
  visited: Set<number>
}

/** Plain Dijkstra, no priority-queue library — graphs here are a single hiking area's OSM network (at most a few thousand nodes before MAX_SEARCH_RADIUS_M/MAX_VISITED_NODES prune it), and this runs once per user tap, not per fix, so an O(n²) min-scan is a non-issue in practice. */
function dijkstra(network: WalkNetwork, startNodeId: number, maxDistM: number, maxNodes: number): DijkstraResult {
  const dist = new Map<number, number>([[startNodeId, 0]])
  const prev = new Map<number, number>()
  const viaHighway = new Map<number, string | undefined>()
  const visited = new Set<number>()

  while (visited.size < maxNodes) {
    let currentId: number | null = null
    let currentDist = Infinity
    for (const [id, d] of Array.from(dist)) {
      if (!visited.has(id) && d < currentDist) { currentDist = d; currentId = id }
    }
    if (currentId == null || currentDist > maxDistM) break
    visited.add(currentId)

    const node = network.nodes.get(currentId)
    if (!node) continue
    for (const edge of node.edges) {
      const nd = currentDist + edge.distM
      if (nd > maxDistM) continue
      const existing = dist.get(edge.to)
      if (existing == null || nd < existing) {
        dist.set(edge.to, nd)
        prev.set(edge.to, currentId)
        viaHighway.set(edge.to, edge.highway)
      }
    }
  }

  return { dist, prev, viaHighway, visited }
}

function reconstructPath(network: WalkNetwork, prev: Map<number, number>, targetNodeId: number, startNodeId: number): [number, number][] {
  const path: [number, number][] = []
  let cur: number | undefined = targetNodeId
  while (cur != null) {
    const node = network.nodes.get(cur)
    if (node) path.unshift([node.lat, node.lon])
    if (cur === startNodeId) break
    cur = prev.get(cur)
  }
  return path
}

function safetyForDistance(distanceM: number, nearThresholdM: number, farThresholdM: number): EscapeSafety {
  if (distanceM <= nearThresholdM) return 'alta'
  if (distanceM <= farThresholdM) return 'media'
  return 'bassa'
}

/**
 * Ranked escape options for the current position, per spec §11. Always
 * includes "torna sul percorso" (needs only the route, not the graph);
 * alternative-trail/road options need a trail graph and are omitted
 * without one; safe-POI options need POIs with a known category (spec
 * §11's "POI sicuri" — hut/bivouac/shelter, see lib/overpass.ts's PoiType).
 * Order matches the spec's own worked example: back to route, then
 * alternative trail, then road, then safe POI — not a strict distance or
 * safety sort, since "return to what you know" is deliberately the first
 * suggestion regardless of whether a closer option exists elsewhere.
 */
export function computeEscapeOptions(input: EscapeEngineInput): EscapeOption[] {
  const { network, routePolyline, currentLat, currentLon, progress, pois } = input
  const options: EscapeOption[] = []

  // 1. Back to the planned route — always available, doesn't need the graph.
  if (Number.isFinite(progress.distanceToRouteM) && progress.distanceToRouteM > 0 && progress.distanceToRouteM < Infinity) {
    const distanceM = progress.distanceToRouteM
    options.push({
      kind: 'back_to_route',
      label: 'Torna sul percorso',
      distanceM,
      safety: safetyForDistance(distanceM, 250, 600),
      reason: `Punto più vicino sul percorso pianificato, a ${Math.round(distanceM)} m in linea d'aria.`,
      bearingDeg: bearingDeg(currentLat, currentLon, progress.nearestPointLat, progress.nearestPointLon),
      targetLat: progress.nearestPointLat,
      targetLon: progress.nearestPointLon,
      path: null,
    })
  }

  // 2 & 3. Alternative trail / road, via the persisted trail graph.
  if (network && network.nodes.size > 0) {
    const start = nearestGraphNode(network, currentLat, currentLon, 400)
    if (start) {
      const { dist, prev, viaHighway, visited } = dijkstra(network, start.nodeId, MAX_SEARCH_RADIUS_M, MAX_VISITED_NODES)

      let bestTrail: { nodeId: number; distM: number; highway?: string } | null = null
      let bestRoad: { nodeId: number; distM: number; highway?: string } | null = null

      for (const nodeId of Array.from(visited)) {
        if (nodeId === start.nodeId) continue
        const node = network.nodes.get(nodeId)
        const d = dist.get(nodeId)
        const highway = viaHighway.get(nodeId)
        if (!node || d == null || !highway) continue
        if (minDistToTrack(node.lat, node.lon, routePolyline) <= MIN_ALTERNATIVE_DISTANCE_FROM_ROUTE_M) continue

        if (ROAD_HIGHWAYS.has(highway)) {
          if (!bestRoad || d < bestRoad.distM) bestRoad = { nodeId, distM: d, highway }
        } else if (highway in TRAIL_HIGHWAY_QUALITY) {
          // Prefer the higher-quality tag first, then the shorter distance among equal quality.
          const quality = TRAIL_HIGHWAY_QUALITY[highway]
          const bestQuality = bestTrail?.highway ? TRAIL_HIGHWAY_QUALITY[bestTrail.highway] ?? 0 : -1
          if (!bestTrail || quality > bestQuality || (quality === bestQuality && d < bestTrail.distM)) {
            bestTrail = { nodeId, distM: d, highway }
          }
        }
      }

      if (bestTrail) {
        const node = network.nodes.get(bestTrail.nodeId)!
        const quality = TRAIL_HIGHWAY_QUALITY[bestTrail.highway!] ?? 1
        options.push({
          kind: 'alternative_trail',
          label: 'Raggiungi trail alternativo',
          distanceM: bestTrail.distM,
          safety: quality >= 3 ? safetyForDistance(bestTrail.distM, 400, 1000) : safetyForDistance(bestTrail.distM, 250, 700),
          reason: `Sentiero (${bestTrail.highway}) della rete OSM, a circa ${Math.round(bestTrail.distM)} m seguendo il percorso più breve nel grafo dei sentieri.`,
          bearingDeg: bearingDeg(currentLat, currentLon, node.lat, node.lon),
          targetLat: node.lat,
          targetLon: node.lon,
          path: reconstructPath(network, prev, bestTrail.nodeId, start.nodeId),
        })
      }

      if (bestRoad) {
        const node = network.nodes.get(bestRoad.nodeId)!
        options.push({
          kind: 'road',
          label: 'Raggiungi strada',
          distanceM: bestRoad.distM,
          safety: safetyForDistance(bestRoad.distM, 500, 1200),
          reason: `Strada (${bestRoad.highway}) raggiungibile seguendo la rete di sentieri e strade — superficie più affidabile in caso di emergenza o maltempo.`,
          bearingDeg: bearingDeg(currentLat, currentLon, node.lat, node.lon),
          targetLat: node.lat,
          targetLon: node.lon,
          path: reconstructPath(network, prev, bestRoad.nodeId, start.nodeId),
        })
      }
    }
  }

  // 4. Safe POI — nearest hut/bivouac/shelter, straight-line only (no graph path search against POIs).
  if (pois && pois.length > 0) {
    let bestPoi: { poi: NavPoi; distM: number } | null = null
    for (const poi of pois) {
      if (!poi.type || !SAFE_POI_TYPES.has(poi.type)) continue
      const distM = haversineM(currentLat, currentLon, poi.lat, poi.lon)
      if (distM > MAX_SAFE_POI_DISTANCE_M) continue
      if (!bestPoi || distM < bestPoi.distM) bestPoi = { poi, distM }
    }
    if (bestPoi) {
      const { poi, distM } = bestPoi
      const isHut = poi.type === 'hut'
      options.push({
        kind: 'safe_poi',
        label: poi.name ? `Raggiungi ${poi.name}` : 'Raggiungi un punto di appoggio',
        distanceM: distM,
        safety: isHut ? safetyForDistance(distM, 1200, 2200) : safetyForDistance(distM, 600, 1500),
        reason: `${poi.name ?? (isHut ? 'Rifugio' : poi.type === 'bivouac' ? 'Bivacco' : 'Riparo')} nelle vicinanze, a circa ${Math.round(distM)} m in linea d'aria — punto di appoggio sicuro.`,
        bearingDeg: bearingDeg(currentLat, currentLon, poi.lat, poi.lon),
        targetLat: poi.lat,
        targetLon: poi.lon,
        path: null,
      })
    }
  }

  return options
}
