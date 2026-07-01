import type { RouteType } from './trailsCache'

// All filters are optional/unset by default — search never requires
// configuring filters first, they only narrow an already-good result set.
export interface SearchFilters {
  distanceKmMin?: number
  distanceKmMax?: number
  elevationGainMin?: number
  elevationGainMax?: number
  durationMinMin?: number
  durationMinMax?: number
  routeType?: RouteType[]
  difficulty?: string[] // SAC codes, e.g. ['T1', 'T2'] — see lib/difficultyTiers.ts
}

export interface FilterableTrail {
  distanceKm: number | null
  elevationGain: number | null
  estimatedTimeMin: number | null
  routeType?: RouteType | null
  sacScale?: string | null
}

// Shared between the server (search/route.ts, applied to already-enriched
// candidates) and the client (progressive enrichment of pendingCandidates as
// their details resolve) so the two never drift out of sync.
export function matchesFilters(trail: FilterableTrail, filters: SearchFilters): boolean {
  const { distanceKm, elevationGain, estimatedTimeMin, routeType, sacScale } = trail

  if (filters.distanceKmMin != null && (distanceKm == null || distanceKm < filters.distanceKmMin)) return false
  if (filters.distanceKmMax != null && (distanceKm == null || distanceKm > filters.distanceKmMax)) return false
  if (filters.elevationGainMin != null && (elevationGain == null || elevationGain < filters.elevationGainMin)) return false
  if (filters.elevationGainMax != null && (elevationGain == null || elevationGain > filters.elevationGainMax)) return false
  if (filters.durationMinMin != null && (estimatedTimeMin == null || estimatedTimeMin < filters.durationMinMin)) return false
  if (filters.durationMinMax != null && (estimatedTimeMin == null || estimatedTimeMin > filters.durationMinMax)) return false
  if (filters.routeType?.length && routeType && !filters.routeType.includes(routeType)) return false
  // Trails with no SAC value are never excluded by the difficulty filter — many
  // valid OSM hiking relations simply don't carry a sac_scale tag.
  if (filters.difficulty?.length && sacScale && !filters.difficulty.includes(sacScale)) return false

  return true
}
