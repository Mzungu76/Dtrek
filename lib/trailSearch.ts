import type { RouteType, DataQuality } from './trailsCache'
import type { SearchFilters } from './trailFilters'

export interface TrailSearchCandidate {
  id: number
  name: string
  ref?: string
  network?: string
}

// Same shape as ExploreMap's TrailResult minus geometryPolyline/elevationProfile —
// the search response stays light; full geometry is only fetched via the
// existing /api/waymarked-trails/details endpoint when a card is opened.
export interface TrailSearchResult extends TrailSearchCandidate {
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  estimatedTimeMin: number | null
  sacScale?: string | null
  caiScale?: string | null
  routeType?: RouteType | null
  dataQuality?: DataQuality | null
  description?: string | null
  from?: string | null
  to?: string | null
}

export interface SearchRequestBody {
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }
  limit?: number
  filters?: SearchFilters
}

export interface SearchResponseBody {
  results: TrailSearchResult[]
  // Cache-miss candidates: stats unknown yet, need a client-side details fetch
  // before they can be rendered fully or filter-matched.
  pendingCandidates: TrailSearchCandidate[]
  totalCandidates: number
  truncated: boolean
}
