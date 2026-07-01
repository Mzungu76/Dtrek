// Moved out of components/ExploreMap.tsx so both the map's click flow and
// ExploreResultsPanel's area-search card flow (and their shared
// lib/fetchTrailDetail.ts helper) can depend on this shape without a
// lib → component import. ExploreMap re-exports it for existing consumers.
export interface TrailResult {
  id: string          // "wmt-{relationId}"
  osmId: number        // same numeric value as the OSM relation id
  name: string
  from?: string
  to?: string
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  altitudeMax: number | null
  altitudeMin: number | null
  sacScale?: string
  caiScale?: string
  ref?: string
  description?: string
  network?: string
  geometryPolyline?: [number, number][]
  estimatedTimeMin?: number | null
  dataQuality?: 'osm_tags' | 'calculated' | 'estimated' | null
  routeType?: 'loop' | 'out_and_back' | 'point_to_point'
  // Sparse (~200m) lat/lon/elevation samples along the route — real SRTM data when
  // available, otherwise a synthesized plausible profile. Used to give the saved
  // hike's trackPoints a real altitudeMeters per point instead of none at all.
  elevationProfile?: { lat: number; lon: number; ele: number }[]
  // true while elevation/duration are still being computed server-side (cache
  // miss + incomplete OSM tags) — distance is always resolved by this point.
  statsPending?: boolean
}
