// Shared staleness policy for every cached score (CTS/Beauty, Safety): computed once, saved,
// and only recomputed for a reason — a relevant settings change (handled at the call site that
// changed the setting) or this periodic re-verification window. There's no server-side scheduler
// in this project, so the 30-day check runs client-side whenever the route/activity is opened.
export const SCORE_STALE_DAYS = 30

export function isScoreFresh(computedAt: string | null | undefined): boolean {
  if (!computedAt) return false
  return Date.now() - new Date(computedAt).getTime() < SCORE_STALE_DAYS * 86400000
}
