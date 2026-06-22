// Security Index (SI) — composite 0-100 trail-condition score from 6 signal
// collectors, cached on `trails` with per-bucket TTLs (see computeSI.ts).

export type SILabelText = 'Percorribile' | 'Probabilmente ok' | 'Verificare prima' | 'Attenzione' | 'Sconsigliato'

export interface SILabel {
  text: SILabelText
  color: string     // semantic color name: green | lime | amber | red | black
  tailwind: string   // tailwind bg-* class for the badge
}

export interface OsmSignal {
  accessPenalty: number       // -60 (access=no) | -40 (access=private) | 0
  visibilityPenalty: number   // -35 (bad/horrible) | -15 (intermediate) | 0
  freshnessScore: number      // +5 (<6mo) | 0 (6-24mo) | -15 (24-48mo) | -30 (>48mo)
  operatorBonus: number       // 0 to +10 (CAI / iwn/nwn / rwn, cumulative, capped)
  lastModified: string | null
}

export interface WeatherSignal {
  precipPenalty: number     // 0 | -8 | -18 | -30 (last 7 days)
  soilPenalty: number       // 0 | -5 | -15 | -25
  surfaceMultiplier: number // 0.5 (gravel/rock) | 1.0 (ground/earth) | 1.5 (mud) | 1.2 (unknown)
  slopeMultiplier: number   // 0.8 (<10%) | 1.0 (10-25%) | 1.3 (>25%)
  totalPenalty: number      // clamp((precipPenalty+soilPenalty) * surfaceMultiplier * slopeMultiplier, -35, 0)
}

export interface ClimateSignal {
  tempPenalty: number     // 0 | -10 | -25 | -15 | -30 depending on current-month avg temp
  altitudeSeason: number  // -20 | -10 | 0 (high altitude + winter months)
  seasonBonus: number     // +5 (Apr/May, Oct/Nov) | 0
}

// Why available:false happened — diagnostic only, never affects scoring.
export type UnavailableReason = 'unreachable' | 'no_data' | 'api_error' | 'no_geometry'

export interface SatelliteSignal {
  available: boolean
  ndviDeltaPenalty: number    // 0 | -10 | -20 | -35
  ndviAbsolutePenalty: number // 0 | -5 | -15
  firePenalty: number         // 0 | -25 | -50  (from NBR)
  floodPenalty: number        // 0 | -15 | -30  (from NDWI)
  landslidePenalty: number    // 0 | -10 | -25  (from BSI)
  reason?: UnavailableReason
}

export interface ActivitySignal {
  dtrekBonus: number     // 0 | +5 | +15 (DTrek activity/planned-hike match recency)
  heatmapPenalty: number // -10 fixed — TODO: Strava heatmap tile analysis
}

export interface CommunitySignal {
  osmNotesPenalty: number
  osmNotesDetails: Array<{ text: string; date: string; distanceM: number }>
  dtrekReviewsScore: number
}

export interface SISignals {
  osm: OsmSignal
  weather: WeatherSignal
  climate: ClimateSignal
  satellite: SatelliteSignal
  activity: ActivitySignal
  community: CommunitySignal
}

export interface SIResult {
  osmRelationId: number
  si: number
  label: SILabel
  isGhostTrail: boolean
  dominantWarning: string | null
  signals: SISignals
  partial: boolean
  cachedAt: string
}

export interface Sentinel2Data {
  osmRelationId: number
  available: boolean
  ndviMonthly: number[] | null        // 12 values, Jan→Dec
  ndviDelta: number | null
  ndwiCurrent: number | null
  nbrCurrent: number | null
  eviCurrent: number | null
  bsiCurrent: number | null
  fireDetected: boolean
  floodDetected: boolean
  landslideRisk: boolean
  shadeScore: number | null            // 0-1
  landscapeVariety: number | null      // V_geo component of TEI
  waterSources: Array<{ lat: number; lon: number }>
  phenologyPeakMonth: number | null    // 1-12
  computedAt: string | null
  stale?: boolean
  reason?: UnavailableReason
  debugInfo?: string   // raw upstream error message (status code only, no secrets) — temporary aid until Vercel log access works
}

// Discriminated responses for the `?polyline=` slow-path API mode, where the
// trail might not be spatially resolvable at all (no error — just no match).
export type SIApiResponse = SIResult | { matched: false }
export type Sentinel2ApiResponse = Sentinel2Data | { matched: false }

// Internal orchestration plumbing (not persisted, not part of any API response) —
// bbox/geometry/OSM tags resolved once by computeSI.ts and threaded into every
// collector so none of them re-fetch the same Overpass/trails-cache data.
export interface SignalContext {
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
  geometry: [number, number][]
  centroid: { lat: number; lon: number }
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  osmTags: Record<string, string>
  osmLastModified: string | null
  matchedActivity: { id: string; recencyDate: string; source: 'activity' | 'planned' } | null
}
