import { haversineM } from '@/lib/geoUtils'
import type { TrackPoint } from '@/lib/tcxParser'

export type SlopeGrade = 'easy' | 'moderate' | 'steep'

export interface SlopeSegment {
  path: [number, number][] // [lat, lon] pairs, at least 2 points
  grade: SlopeGrade
}

export const SLOPE_GRADE_COLOR: Record<SlopeGrade, string> = {
  easy: '#2f7d54',
  moderate: '#a66a0c',
  steep: '#b32a2a',
}

// Percent grade (rise/run × 100) thresholds — common hiking-trail convention,
// independent of trailScore.ts's whole-route avgSlopeDeg multiplier (that's a
// single aggregate value for difficulty scoring; this buckets each stretch of
// the actual track for the map's Pendenze layer).
const MODERATE_GRADE_PCT = 8
const STEEP_GRADE_PCT = 16

function gradeFor(pct: number): SlopeGrade {
  const abs = Math.abs(pct)
  if (abs >= STEEP_GRADE_PCT) return 'steep'
  if (abs >= MODERATE_GRADE_PCT) return 'moderate'
  return 'easy'
}

/**
 * Buckets the route's recorded track into contiguous same-grade stretches for the map's Pendenze
 * (slope) layer — consecutive points get coalesced into one segment as long as the grade bucket
 * doesn't change, so the line renders as a handful of colored stretches rather than one tiny
 * segment per GPS point. Returns null when there isn't enough altitude data to say anything (most
 * imported tracks without elevation, or fewer than 2 usable points).
 */
export function buildSlopeSegments(trackPoints: TrackPoint[]): SlopeSegment[] | null {
  const pts = trackPoints.filter((p) => p.lat != null && p.lon != null && p.altitudeMeters != null)
  if (pts.length < 2) return null

  const segments: SlopeSegment[] = []
  let current: SlopeSegment | null = null

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const runM = haversineM(a.lat!, a.lon!, b.lat!, b.lon!)
    if (runM < 1) continue // stationary/duplicate fix — no meaningful run to grade
    const risePct = ((b.altitudeMeters! - a.altitudeMeters!) / runM) * 100
    const grade = gradeFor(risePct)

    if (current && current.grade === grade) {
      current.path.push([b.lat!, b.lon!])
    } else {
      current = { grade, path: [[a.lat!, a.lon!], [b.lat!, b.lon!]] }
      segments.push(current)
    }
  }
  return segments.length > 0 ? segments : null
}
