import type { TrackPoint } from '@/lib/tcxParser'

export function haversineMDiario(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Output canvas height for a fixed-`outW` route map, derived from the
 * route's own aspect ratio (clamped) instead of a one-size-fits-all
 * landscape box — keeps drawLetterboxed's white margins minimal so the map
 * fills the page width like the rest of the layout, without touching its
 * zoom/crop selection.
 */
export function mapOutH(aspect: number, outW = 660): number {
  const clamped = Math.min(3.2, Math.max(0.9, aspect))
  return Math.round(outW / clamped)
}

/** Maps each trackpoint to its fraction (0–1) of cumulative GPS distance along the route. */
export function trackPointsProgress(trackPoints: TrackPoint[]): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < trackPoints.length; i++) {
    const p = trackPoints[i], q = trackPoints[i - 1]
    const d = (p.lat !== undefined && p.lon !== undefined && q.lat !== undefined && q.lon !== undefined)
      ? haversineMDiario(q.lat, q.lon, p.lat, p.lon) : 0
    cum.push(cum[i - 1] + d)
  }
  const total = cum[cum.length - 1] || 1
  return cum.map(d => d / total)
}

/** Extracts `[curiosita]…[/curiosita]` blocks out of a section body so they can be
 * rendered as a pull quote / storytelling box instead of inline plain text. */
export function extractCuriosita(body: string): { clean: string; quotes: string[] } {
  const quotes: string[] = []
  const clean = body.replace(/\[curiosita\]([\s\S]*?)\[\/curiosita\]/g, (_, inner) => { quotes.push(inner.trim()); return '' }).trim()
  return { clean, quotes }
}
