// Security Index (SI) — composite 0-100 trail-condition score from 6 signal
// collectors, cached on `trails` with per-bucket TTLs (see computeSI.ts).
import type { RockfallRisk } from '@/lib/geologia/lithologyRiskMap'

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
  // floodPenalty/landslidePenalty: NDWI/BSI-derived by default, overridden (not summed)
  // by an official PAI polygon when one intersects the trail — see *Source below and
  // lib/si/signals/satelliteSignals.ts's fetchPaiOverride.
  floodPenalty: number        // 0 | -15 | -30 (ndwi) | -5/-15/-35/-60 (pai P1-P4)
  landslidePenalty: number    // 0 | -10 | -25 (bsi) | -5/-15/-35/-60 (pai R1-R4)
  landslideSource: 'pai' | 'bsi' | 'none'
  floodSource: 'pai' | 'ndwi' | 'none'
  paiLandslideClass?: string  // e.g. 'R3' — set only when landslideSource === 'pai'
  paiFloodClass?: string      // e.g. 'P2' — set only when floodSource === 'pai'
  // rockfallPenalty has no satellite-heuristic predecessor (BSI is bare-soil/erosion, not
  // rockfall) — purely additive, always 0/'none' until GEOLOGIA_DATASET is live (see
  // satelliteSignals.ts's fetchRockfallOverride). Stays in this signal/TTL bucket rather than
  // becoming its own collector, unlike groundStability (which needed a dedicated 180d TTL).
  rockfallPenalty: number     // 0 | -5 (low) | -20 (medium) | -45 (high)
  rockfallSource: 'geologia' | 'none'
  rockfallClass?: RockfallRisk // set only when rockfallSource === 'geologia'
  reason?: UnavailableReason
}

export interface ActivitySignal {
  dtrekBonus: number     // 0 | +5 | +15 (DTrek *completed activity* match recency — never from planned/imported hikes)
  heatmapPenalty: number // -10 fixed — TODO: Strava heatmap tile analysis
}

export type GroundStabilityClass = 'stable' | 'slow' | 'moderate' | 'rapid' | 'unknown'

// PSInSAR (radar deformation velocity) — 7° segnale SI, vedi
// lib/si/signals/groundStability.ts. Bucket TTL dedicato (180gg, non quello satellite):
// il prodotto è aggiornato su scala annuale/pluriennale.
export interface GroundStabilitySignal {
  available: boolean
  pointCount: number             // punti PSInSAR trovati nel bbox (0 = nessuna copertura, non "stabile")
  maxVelocityMmYear: number | null // valore con segno, punto più veloce entro 250m da un vertice del tracciato
  classification: GroundStabilityClass
  confidence: 'high' | 'low' | 'none' // high: punto più vicino <=100m, low: 100-250m, none: nessun match
  penalty: number                 // 0 | -10 (slow) | -25 (moderate) | -45 (rapid), dimezzata se confidence è 'low'
  reason?: UnavailableReason
}

export interface CommunitySignal {
  osmNotesPenalty: number
  osmNotesDetails: Array<{ text: string; date: string; distanceM: number }>
  // Penalty from difficulty markers extracted from imported GPX files
  // (Komoot/AllTrails waypoint & track comments) near this trail — see
  // lib/difficultyMarkers.ts and lib/si/signals/communitySignals.ts.
  // Never positive: a GPX comment never says a trail "was worth it", only
  // flags hazards.
  difficultyMarkersPenalty: number
  difficultyMarkersDetails: Array<{ text: string; severity: 'info' | 'warning' | 'danger'; distanceM: number }>
}

export interface SISignals {
  osm: OsmSignal
  weather: WeatherSignal
  climate: ClimateSignal
  satellite: SatelliteSignal
  activity: ActivitySignal
  community: CommunitySignal
  groundStability: GroundStabilitySignal
}

export interface SIResult {
  // Exactly one of the two is set: osmRelationId when scored against the
  // shared `trails` cache, plannedHikeId when scored standalone for a
  // planned hike with no OSM correspondence (see computeSIForPlannedHike).
  osmRelationId?: number
  plannedHikeId?: string
  si: number
  label: SILabel
  isGhostTrail: boolean
  dominantWarning: string | null
  signals: SISignals
  partial: boolean
  cachedAt: string
}

export interface Sentinel2Data {
  osmRelationId?: number
  plannedHikeId?: string
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
  matchedActivity: { id: string; recencyDate: string; source: 'activity' } | null
}
