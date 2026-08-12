/**
 * Named, ready-to-run scenarios built from scenarioBuilder.ts's primitives
 * — what the dev "simulate" mode (see app/guida/[id]/naviga's ?simulate=
 * query param) actually offers, so trying a scenario doesn't require
 * writing code each time. Each one is relative to the real route being
 * navigated, so it exercises the exact Off-Route/Escape Engine
 * configuration that route would hit for real.
 */
import { walkAlongRoute, injectDeviation, injectPoorAccuracy, injectGpsLoss, injectSpike } from './scenarioBuilder'
import type { GeoFix } from '../types'

export const SCENARIO_NAMES = ['clean', 'off_route', 'wrong_direction', 'uncertain', 'gps_lost', 'spike'] as const
export type ScenarioName = (typeof SCENARIO_NAMES)[number]

export const SCENARIO_LABELS: Record<ScenarioName, string> = {
  clean: 'Percorso pulito',
  off_route: 'Deviazione (off-route)',
  wrong_direction: 'Direzione sbagliata',
  uncertain: 'GPS impreciso (uncertain)',
  gps_lost: 'Perdita GPS',
  spike: 'Spike GPS singolo',
}

export function buildScenario(name: ScenarioName, routePolyline: [number, number][]): GeoFix[] {
  const base = walkAlongRoute(routePolyline)
  if (base.length < 20) return base // route too short to script a meaningful mid-walk event
  const eventIndex = Math.floor(base.length * 0.3)

  switch (name) {
    case 'clean':
      return base
    case 'off_route':
      // 45m to the side over 25s, comfortably past offRouteEngine.ts's default dwell (~15-20s
      // sustained + growing) so this should reliably land on OFF_ROUTE, not flicker through UNCERTAIN.
      return injectDeviation(base, eventIndex, 45, 90, 25)
    case 'wrong_direction':
      // Stays on the route positionally (lat/lon untouched) but reports a heading ~180° opposite
      // the route's own forward direction — physically a simplification (a real about-face would
      // also start moving the position backward), but isolates the direction-compatibility check
      // in offRouteEngine.ts without also tripping the distance-based OFF_ROUTE check.
      return base.map((f, i) =>
        i >= eventIndex && i < eventIndex + 10 ? { ...f, bearingDeg: ((f.bearingDeg ?? 0) + 180) % 360 } : f)
    case 'uncertain':
      return injectPoorAccuracy(base, eventIndex, 40, 20)
    case 'gps_lost':
      return injectGpsLoss(base, eventIndex, 20)
    case 'spike':
      return injectSpike(base, eventIndex)
    default:
      return base
  }
}
