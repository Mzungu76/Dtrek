/**
 * Map Matching (spec §4) — non-invasive by design, same as routeDeviation.ts's RouteTracker:
 * this NEVER moves the raw fix, it only adds an interpretation on top of it. Distinct from the
 * Escape Engine's full graph search (escapeEngine.ts, a Dijkstra over hundreds/thousands of
 * nodes run once per user tap): this only asks "what's the single closest known trail edge to
 * where I actually am right now", cheap enough to run on every fix while already off-route,
 * which is the only time it's called (see ActiveNavigationView.tsx) — while on the planned
 * route there's nothing this would add.
 *
 * The signal this produces is purely informational: "you're off the planned route, but there's
 * a real, mapped trail right under you" reads very differently from "you're off the planned
 * route and off any known trail too" — the former is very likely a deliberate alternative or a
 * junction the plan didn't anticipate, the latter is much more likely to actually be lost.
 * Neither the Off-Route Engine's on/off-route verdict nor the position shown on the map is
 * changed by this — it only adds detail to the banner/UI already driven by offRouteEngine.ts.
 */
import { haversineM } from '@/lib/geoUtils'
import type { WalkNetwork } from '@/lib/routeBuilder/osmGraph'

export type MapMatchConfidence = 'high' | 'medium' | 'low'

export interface MapMatchResult {
  /** True once distanceToRouteM is already small enough that matching against the graph has nothing to add — mirrors offRouteEngine.ts's baseThresholdM. */
  onPlannedRoute: boolean
  /** OSM way id of the closest trail-graph edge found within range, or null if none was close enough. */
  matchedWayId: number | null
  matchedHighway: string | undefined
  distanceToMatchM: number | null
  /** True when a real, distinct trail (not the planned route) was found close enough that the hiker is very likely following it on purpose rather than being off-trail entirely. */
  alternativeDetected: boolean
  confidence: MapMatchConfidence
}

const ON_ROUTE_THRESHOLD_M = 20
const MATCH_SEARCH_RADIUS_M = 60
const HIGH_CONFIDENCE_M = 15
const MEDIUM_CONFIDENCE_M = 35

const NO_MATCH: Omit<MapMatchResult, 'onPlannedRoute'> = {
  matchedWayId: null,
  matchedHighway: undefined,
  distanceToMatchM: null,
  alternativeDetected: false,
  confidence: 'low',
}

/** Perpendicular distance in meters from (lat, lon) to the segment [a, b] — equirectangular projection centered on the point itself, accurate at the tens-of-meters scale this is used at (same approach as routeDeviation.ts/positionEngine.ts, kept local rather than shared since each of those modules deliberately owns its own minimal projection helper instead of a shared route-math dependency). */
function distPointToSegmentM(lat: number, lon: number, aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000
  const cosLat = Math.cos(lat * Math.PI / 180)
  const toXY = (la: number, lo: number): [number, number] => [(lo - lon) * Math.PI / 180 * cosLat * R, (la - lat) * Math.PI / 180 * R]
  const [ax, ay] = toXY(aLat, aLon)
  const [bx, by] = toXY(bLat, bLon)
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(ax, ay)
  const t = Math.max(0, Math.min(1, (-ax * dx - ay * dy) / lenSq))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

/**
 * Finds the closest trail-graph edge to the current position and classifies how confidently it
 * explains "what the hiker is actually walking on". Returns `onPlannedRoute: true` (skipping the
 * graph scan entirely) once already close enough to the planned route that this has nothing to add.
 */
export function matchToTrailGraph(input: {
  network: WalkNetwork | null
  lat: number
  lon: number
  distanceToRouteM: number
}): MapMatchResult {
  const { network, lat, lon, distanceToRouteM } = input

  if (distanceToRouteM <= ON_ROUTE_THRESHOLD_M) {
    return { onPlannedRoute: true, ...NO_MATCH }
  }
  if (!network || network.nodes.size === 0) {
    return { onPlannedRoute: false, ...NO_MATCH }
  }

  // Cheap bbox pre-filter before any segment-distance math, since the graph can hold thousands
  // of nodes for a wide-bbox hike — most are nowhere near the current position.
  const roughRadiusDeg = MATCH_SEARCH_RADIUS_M / 111_000
  let best: { wayId: number; highway?: string; distM: number } | null = null
  const seenEdges = new Set<string>()

  for (const [nodeId, node] of Array.from(network.nodes)) {
    if (Math.abs(node.lat - lat) > roughRadiusDeg || Math.abs(node.lon - lon) > roughRadiusDeg) continue
    for (const edge of node.edges) {
      const edgeKey = nodeId < edge.to ? `${nodeId}:${edge.to}` : `${edge.to}:${nodeId}`
      if (seenEdges.has(edgeKey)) continue
      seenEdges.add(edgeKey)
      const other = network.nodes.get(edge.to)
      if (!other) continue
      // Cheap reject before the projection math: if even the straight-line distance to the far
      // endpoint is well outside range and the near endpoint already was too, skip it.
      if (haversineM(lat, lon, node.lat, node.lon) > MATCH_SEARCH_RADIUS_M * 3) continue
      const distM = distPointToSegmentM(lat, lon, node.lat, node.lon, other.lat, other.lon)
      if (distM > MATCH_SEARCH_RADIUS_M) continue
      if (!best || distM < best.distM) best = { wayId: edge.wayId, highway: edge.highway, distM }
    }
  }

  if (!best) return { onPlannedRoute: false, ...NO_MATCH }

  const confidence: MapMatchConfidence = best.distM <= HIGH_CONFIDENCE_M ? 'high' : best.distM <= MEDIUM_CONFIDENCE_M ? 'medium' : 'low'
  return {
    onPlannedRoute: false,
    matchedWayId: best.wayId,
    matchedHighway: best.highway,
    distanceToMatchM: best.distM,
    alternativeDetected: confidence !== 'low',
    confidence,
  }
}
