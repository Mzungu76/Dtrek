/**
 * NavigationEngine.reverseRoute() — the hiker confirmed (wrong_direction banner action, see
 * ActiveNavigationView.tsx) that walking the route end-to-start is deliberate. Exercises the
 * orchestration this method does on top of already-tested pure pieces (RouteTracker,
 * buildRouteInstructions, reverseElevationProfile): route progress re-bases from the other end,
 * a stuck off_route/wrong_direction/uncertain state clears, and the toggle is reversible.
 *
 * Runs the real engine headless under vitest/Node, same approach as realRouteSimulation.test.ts
 * — a fake LocationProviderFactory captures the onFix callback instead of touching real GPS, and
 * vi.useFakeTimers() keeps every Date.now()-based check (PositionEngine's anti-replay window,
 * NavigationEngine's dwell timers/watchdogs) consistent with the fix timestamps fed in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NavigationEngine } from '../navigationEngine'
import type { LocationProvider, LocationProviderFactory } from '@/lib/native/locationSource'
import type { GeoFix } from '../types'

function fakeProvider(): { factory: LocationProviderFactory; push: (fix: GeoFix) => void } {
  let onFixCb: ((fix: GeoFix) => void) | null = null
  const factory: LocationProviderFactory = (onFix) => {
    onFixCb = onFix
    const provider: LocationProvider = {
      start: async () => {},
      stop: () => {},
      setMode: async () => {},
      catchUp: async () => {},
    }
    return provider
  }
  return { factory, push: (fix) => onFixCb?.(fix) }
}

// Straight line heading due north, ~1112m long (0.01deg of latitude).
const ROUTE: [number, number][] = [
  [45.0000, 7.0000],
  [45.0100, 7.0000],
]

function fixAt(lat: number, lon: number, ts: number): GeoFix {
  return { lat, lon, ts, accuracyM: 8, speedMs: 1.2, source: 'simulated' }
}

describe('NavigationEngine.reverseRoute', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T08:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-bases progress from the other end and is reversible', () => {
    const { factory, push } = fakeProvider()
    const engine = new NavigationEngine({ routePolyline: ROUTE, pois: [], locationProviderFactory: factory })
    engine.start()

    let progress: import('../types').RouteProgress | null = null
    engine.on('positionUpdated', (p) => { progress = p.progress })

    // A fix a third of the way along the route (from the original start).
    push(fixAt(45.0033, 7.0000, Date.now()))
    expect(progress).not.toBeNull()
    const forwardDistanceM = progress!.distanceAlongRouteM
    const totalM = progress!.totalRouteM
    expect(forwardDistanceM).toBeGreaterThan(0)
    expect(forwardDistanceM).toBeLessThan(totalM)

    let reversedEventFired = false
    engine.on('routeReversed', () => { reversedEventFired = true })

    engine.reverseRoute()
    expect(reversedEventFired).toBe(true)
    expect(engine.isReversed).toBe(true)

    // Same physical position, but now measured from the other end.
    vi.advanceTimersByTime(1000)
    push(fixAt(45.0033, 7.0000, Date.now()))
    expect(progress!.distanceAlongRouteM).toBeCloseTo(totalM - forwardDistanceM, 0)
    expect(progress!.totalRouteM).toBeCloseTo(totalM, 6)

    // Flips back to the original direction on a second call.
    engine.reverseRoute()
    expect(engine.isReversed).toBe(false)
    vi.advanceTimersByTime(1000)
    push(fixAt(45.0033, 7.0000, Date.now()))
    expect(progress!.distanceAlongRouteM).toBeCloseTo(forwardDistanceM, 0)

    engine.stop()
  })

  it('clears a stuck off_route state back to navigating', () => {
    const { factory, push } = fakeProvider()
    const engine = new NavigationEngine({ routePolyline: ROUTE, pois: [], locationProviderFactory: factory })
    engine.start()

    let state: import('../types').NavState = 'idle'
    engine.on('stateChanged', ({ to }) => { state = to })
    let backOnRouteFired = false
    engine.on('backOnRoute', () => { backOnRouteFired = true })

    // ~157m east of the route's midpoint — well past the off-route threshold — sustained long
    // enough (offRouteDwellMs=15s) with non-worsening trend to latch into 'off_route'.
    const offRouteLat = 45.0050
    const offRouteLon = 7.0020
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(5000)
      push(fixAt(offRouteLat, offRouteLon, Date.now()))
    }
    expect(state).toBe('off_route')

    engine.reverseRoute()
    expect(state).toBe('navigating')
    expect(backOnRouteFired).toBe(true)

    engine.stop()
  })
})
