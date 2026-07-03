/** Shared types for the navigation engine — pure data, no React/DOM dependency. */

export interface GeoFix {
  lat: number
  lon: number
  altitudeM?: number | null
  accuracyM?: number | null
  speedMs?: number | null
  ts: number // epoch ms
}

export type NavState =
  | 'idle'
  | 'navigating'
  | 'poi_near'
  | 'off_route'
  | 'gps_lost'
  | 'finished'

export interface NavPoi {
  id: string | number
  lat: number
  lon: number
  name?: string
  notifyRadiusM?: number
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
  /** bearingToRouteDeg is the absolute compass bearing (0-360, north-up) from the current fix to the nearest point on the planned route, for a "head this way to get back on track" indicator. */
  offRoute: { distanceToRouteM: number; bearingToRouteDeg: number | null }
  backOnRoute: {}
  /** permissionDenied distinguishes "the user denied the location permission" (unrecoverable without a settings change) from an ordinary temporary signal loss (weak signal, tunnel, timeout). */
  gpsLost: { permissionDenied: boolean }
  gpsRecovered: {}
  stateChanged: { from: NavState; to: NavState }
  paceUpdated: import('./paceAssistant').PaceUpdateResult
}

export type NavEventName = keyof NavEventMap
