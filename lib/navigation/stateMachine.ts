import type { NavState } from './types'

const TRANSITIONS: Record<NavState, NavState[]> = {
  idle:        ['navigating'],
  navigating:  ['poi_near', 'off_route', 'gps_lost', 'finished'],
  poi_near:    ['navigating', 'off_route', 'gps_lost', 'finished'],
  off_route:   ['navigating', 'poi_near', 'gps_lost', 'finished'],
  gps_lost:    ['navigating', 'poi_near', 'off_route', 'finished'],
  finished:    [],
}

/**
 * Centralizes every navigation state transition in one place, so HUD colour,
 * notifications, audio and vibration all read from a single source of truth
 * instead of scattered conditionals across UI components.
 */
export class NavStateMachine {
  private current: NavState = 'idle'

  get state(): NavState {
    return this.current
  }

  /** Returns the new state if the transition was applied, or null if it was invalid/no-op. */
  transition(to: NavState): NavState | null {
    if (to === this.current) return null
    if (!TRANSITIONS[this.current].includes(to)) return null
    this.current = to
    return to
  }
}
