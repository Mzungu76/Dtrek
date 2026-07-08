// Per-instance (in-memory) circuit breaker for flaky external WMS/WFS endpoints (ISPRA/MASE
// geoportals return 502/503/522 in bursts). Without this, every request retries the full
// per-call timeout against an endpoint that's already down — under load that's what turned
// a few minutes of upstream downtime into hours of wasted Active CPU on /api/tei-terrain.
// After a few consecutive failures, short-circuits further calls for a cooldown window instead
// of waiting out the timeout each time; state resets on the next success after cooldown.
const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 60_000

interface BreakerState {
  consecutiveFailures: number
  openUntil: number
}

const breakers = new Map<string, BreakerState>()

export function isCircuitOpen(key: string): boolean {
  const state = breakers.get(key)
  return state != null && state.openUntil > Date.now()
}

export function recordSuccess(key: string): void {
  breakers.delete(key)
}

export function recordFailure(key: string): void {
  const state = breakers.get(key) ?? { consecutiveFailures: 0, openUntil: 0 }
  state.consecutiveFailures += 1
  if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
    state.openUntil = Date.now() + COOLDOWN_MS
  }
  breakers.set(key, state)
}
