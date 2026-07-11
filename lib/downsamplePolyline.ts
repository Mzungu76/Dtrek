import type { TrackPoint } from './tcxParser'

/** Reduces a full-resolution GPS track to a lightweight polyline (≤ maxPts points) — used both by
 *  the server (app/api/planned|activity|migrate/route.ts) to persist a compact preview shape, and
 *  client-side at import time (see components/upload/GpxUploader.tsx) so a freshly-imported hike
 *  has a usable polyline immediately instead of waiting for a server round-trip that can be
 *  delayed or fail entirely during a Supabase outage. Pure function, no I/O. */
export function downsamplePolyline(pts: TrackPoint[], maxPts = 60): [number, number][] {
  const valid = pts.filter(p => p.lat !== undefined && p.lon !== undefined)
  if (!valid.length) return []
  const count = Math.min(valid.length, maxPts)
  const step  = (valid.length - 1) / (count - 1 || 1)
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.min(Math.round(i * step), valid.length - 1)
    return [
      Math.round(valid[idx].lat! * 1e5) / 1e5,
      Math.round(valid[idx].lon! * 1e5) / 1e5,
    ]
  })
}
