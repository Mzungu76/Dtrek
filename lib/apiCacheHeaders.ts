// Shared Cache-Control value for GET routes whose successful response depends only on the
// request's own query params (bbox/track), not on the caller's identity — safe to cache at the
// browser/CDN edge so a second request for the same area/track (from this user reopening a hike,
// or a different user nearby) can skip the route handler (and whatever upstream it calls)
// entirely. 1h browser/edge freshness, serving stale for up to a day while revalidating in the
// background — long enough to matter, short enough that a real change (rare — see each route's
// own comment on why the underlying data barely moves) surfaces within a day regardless.
//
// Deliberately NOT applied to error/"unavailable" fallback responses (only to genuine successes)
// — caching a transient failure for an hour would turn a blip into an hour-long outage for that
// bbox/track.
export const SUCCESS_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400'
