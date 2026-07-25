// Shared color mapping for DTM-derived slope/aspect map overlays — used by both
// components/MapView.tsx (Leaflet, 2D) and components/RouteMap3D.tsx (MapLibre, 3D), so the
// same trail segment renders the same color regardless of which map is open. Slope buckets
// (10°/20°/30°/40°) are deliberately the same thresholds as lib/trailScore.ts's
// slopeTerrainMult — this is the real difficulty cutover, not an independent color choice,
// so a map showing "steep" should agree with the score calling it steep.
import { nearestPerSegment, type LatLon } from '@/lib/geo/nearestPoint'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

export type DtmColorMode = 'slope' | 'aspect'

const FLAT_COLOR = '#9ca3af' // grey — also used for "no DTM sample near this segment"

export function slopeDegToColor(slopeDeg: number): string {
  const a = Math.abs(slopeDeg)
  if (a < 10) return '#22c55e'
  if (a < 20) return '#eab308'
  if (a < 30) return '#f97316'
  if (a < 40) return '#ef4444'
  return '#7f1d1d'
}

// Scala caldo/freddo invece della ruota cromatica diretta (hue = bearing) usata prima — quella
// mappava il Sud (versante più soleggiato/caldo alle nostre latitudini) su un ciano che si legge
// visivamente "freddo", e il Nord (più in ombra/freddo) su un rosso che si legge "caldo": l'esatto
// contrario dell'intuizione dell'utente. Qui il colore segue quanto un versante è esposto a sud
// (soleggiato/caldo, tendente al rosso-arancio) o a nord (in ombra/freddo, tendente al blu), con
// est/ovest in una fascia neutra giallo-verde a metà strada — coerente con la legenda in
// MapView.tsx, che usa questa stessa funzione per i quattro colori mostrati.
export function aspectDegToColor(aspectDeg: number): string {
  if (Number.isNaN(aspectDeg)) return FLAT_COLOR
  // +1 a Sud (180°, il più caldo), -1 a Nord (0°/360°, il più freddo), 0 a Est/Ovest (neutro).
  const warmth = Math.cos((aspectDeg - 180) * Math.PI / 180)
  const hue = warmth >= 0
    ? 70 - warmth * 55   // 70 (neutro, E/O) → 15 (rosso-arancio, S)
    : 70 - warmth * 140  // 70 (neutro, E/O) → 210 (blu, N)
  return `hsl(${hue}, 72%, 48%)`
}

/**
 * Colors one map segment per consecutive pair of `points` using the nearest DTM sample
 * (within matchRadiusM of the pair's midpoint). Returns null for a pair when no DTM sample
 * is close enough — callers decide the fallback (GPX-derived slope color for 'slope' mode,
 * nothing renderable for 'aspect' mode, which has no non-DTM source).
 */
export function colorSegmentsByDtm(
  points: LatLon[],
  dtmProfile: TrailDtmProfile,
  mode: DtmColorMode,
  matchRadiusM = 25,
): (string | null)[] {
  if (dtmProfile.source !== 'dtm' || points.length < 2) {
    return new Array(Math.max(points.length - 1, 0)).fill(null)
  }

  const midpoints: LatLon[] = []
  for (let i = 0; i < points.length - 1; i++) {
    midpoints.push(midpoint(points[i], points[i + 1]))
  }

  const matches = nearestPerSegment(midpoints, dtmProfile.points, matchRadiusM)

  return matches.map(match => {
    if (!match) return null
    return mode === 'slope'
      ? slopeDegToColor(match.candidate.slopeDeg)
      : aspectDegToColor(match.candidate.aspectDeg)
  })
}

function midpoint(a: LatLon, b: LatLon): LatLon {
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
}
