/** Shared types for the navigation engine — pure data, no React/DOM dependency. */

export interface GeoFix {
  lat: number
  lon: number
  altitudeM?: number | null
  accuracyM?: number | null
  speedMs?: number | null
  ts: number // epoch ms
  /** Device-reported heading of travel, when the source provides one (native GNSS fixes; the browser Geolocation API rarely does). Distinct from the device compass (see orientation.ts). */
  bearingDeg?: number | null
  verticalAccuracyM?: number | null
  speedAccuracyMs?: number | null
  /** Which Location Engine produced this fix — surfaced for diagnostics (Navigation Health screen, spec §16), never used to change trust decisions by itself. */
  source?: 'native' | 'web'
  /** True when the OS flagged this fix as coming from a mock/spoofed provider (native only) — the Position Engine's quality gate should reject these outright. */
  mock?: boolean
}

export type NavState =
  | 'idle'
  | 'navigating'
  | 'poi_near'
  /** Distance-to-route reading can't be trusted enough to call it either way (poor GPS accuracy) — spec §15.6: say so instead of guessing. Distinct from off_route, which is a confirmed deviation. */
  | 'uncertain'
  | 'off_route'
  /** Distance-to-route is small (still "on" the trail) but heading of travel is incompatible with the route's forward direction at that point — e.g. doubled back, or on a look-alike parallel path at a junction. See lib/navigation/offRouteEngine.ts. */
  | 'wrong_direction'
  | 'gps_lost'
  | 'finished'

export interface NavPoi {
  id: string | number
  lat: number
  lon: number
  name?: string
  notifyRadiusM?: number
  /** OSM POI category (lib/overpass.ts's PoiType), when known — lets the Escape Engine (lib/navigation/escapeEngine.ts) tell a hut/bivouac/shelter apart from a viewpoint or a bench when ranking "safe POI" escape destinations. Optional/untyped here (not importing PoiType) to keep this file free of a dependency on the POI-fetching layer; callers narrow it themselves. */
  type?: string
}

/** A non-POI narrative beat along the route (climb start, viewpoint, exposed section...). */
export interface RouteMoment {
  id: string
  lat: number
  lon: number
  distanceAlongRouteM: number
  kind: 'climb_start' | 'viewpoint' | 'exposed' | 'junction' | 'environment_change'
  text: string
}

export interface RouteProgress {
  nearestSegmentIndex: number
  distanceToRouteM: number
  distanceAlongRouteM: number
  totalRouteM: number
  /** Closest point on the route polyline to the fix that produced this progress — used to derive a "head this way" bearing when off-route. */
  nearestPointLat: number
  nearestPointLon: number
  /** Compass bearing (0-360) of the route polyline's own forward direction at the nearest segment — the "correct heading" to compare a hiker's actual bearing against for wrong_direction detection. Null only when the route has fewer than 2 points. */
  expectedBearingDeg: number | null
}

export type TurnType = 'start' | 'straight' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'arrive'

/** A geometric turn-by-turn cue derived from the route polyline itself (bearing changes), independent of POIs/moments — the hiking equivalent of a driving nav's "turn right in 200m". */
export interface NavInstruction {
  id: string
  distanceAlongRouteM: number
  turn: TurnType
  text: string
}

export type NavEventMap = {
  positionUpdated: {
    raw: GeoFix
    smoothed: GeoFix
    progress: RouteProgress
    /** Cumulative actual distance walked (sum of consecutive smoothed fixes, jump-clamped) — NOT the same as progress.distanceAlongRouteM, which is a projection onto the planned route and can swing wildly while off-route. Use this for a "distance so far" stat. */
    traveledDistanceM: number
    /** Best-effort instantaneous speed: the device's own reading when it looks sane, otherwise derived from consecutive fixes. */
    instantSpeedMs: number | null
  }
  bearingUpdated: { bearingDeg: number; source: 'sensor' | 'gps' }
  enteredPoi: { poi: NavPoi }
  leftPoi: { poi: NavPoi }
  momentReached: { moment: RouteMoment }
  instructionUpdated: { current: NavInstruction; next: NavInstruction | null; distanceToNextM: number | null }
  /** bearingToRouteDeg is the absolute compass bearing (0-360, north-up) from the current fix to the nearest point on the planned route, for a "head this way to get back on track" indicator. Fired for both off_route and wrong_direction (both mean "not following the intended path") — existing UI (haptics/speech/banner) treats them the same; wrongDirection below carries the extra detail for anything that wants to distinguish them. */
  offRoute: { distanceToRouteM: number; bearingToRouteDeg: number | null }
  backOnRoute: {}
  /** GPS accuracy currently too poor to trust the distance-to-route reading either way — communicated explicitly per spec §15.6, rather than silently guessing on/off. */
  uncertain: { distanceToRouteM: number; accuracyM: number | null }
  certain: {}
  /** On the route (small distanceToRouteM) but heading of travel doesn't match the route's own forward direction there — see NavState.wrong_direction. */
  wrongDirection: { headingDeg: number | null; expectedHeadingDeg: number | null }
  rightDirection: {}
  /** permissionDenied distinguishes "the user denied the location permission" (unrecoverable without a settings change) from an ordinary temporary signal loss (weak signal, tunnel, timeout). */
  gpsLost: { permissionDenied: boolean }
  gpsRecovered: {}
  stateChanged: { from: NavState; to: NavState }
  paceUpdated: import('./paceAssistant').PaceUpdateResult
}

export type NavEventName = keyof NavEventMap
