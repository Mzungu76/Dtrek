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
  positionUpdated: { raw: GeoFix; smoothed: GeoFix; progress: RouteProgress }
  bearingUpdated: { bearingDeg: number; source: 'sensor' | 'gps' }
  enteredPoi: { poi: NavPoi }
  leftPoi: { poi: NavPoi }
  momentReached: { moment: RouteMoment }
  instructionUpdated: { current: NavInstruction; next: NavInstruction | null; distanceToNextM: number | null }
  offRoute: { distanceToRouteM: number }
  backOnRoute: {}
  gpsLost: {}
  gpsRecovered: {}
  stateChanged: { from: NavState; to: NavState }
}

export type NavEventName = keyof NavEventMap
