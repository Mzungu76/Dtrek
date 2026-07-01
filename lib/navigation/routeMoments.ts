import { haversineM } from '@/lib/geoUtils'
import type { TrackPoint } from '@/lib/tcxParser'
import type { RouteMoment } from './types'

const CLIMB_GRADIENT_PCT = 8       // sustained slope above this % counts as "a real climb"
const CLIMB_MIN_LENGTH_M = 300     // ...for at least this long, to ignore short bumps
const SMOOTH_WINDOW_M = 150

/**
 * First-pass heuristic for "moments of the route": narrative beats a guide
 * would naturally call out, independent of Overpass/Wikipedia POIs. Only
 * climb-start detection is implemented here (from track elevation profile,
 * already available in trackPoints — no new data source needed); viewpoint/
 * exposed-section/junction detection would need slope+curvature+DTM signals
 * already computed elsewhere (lib/dtm/) and is left for a later iteration
 * once this pattern is validated with real hikers.
 */
export function detectRouteMoments(trackPoints: TrackPoint[]): RouteMoment[] {
  const pts = trackPoints.filter((p) => p.lat != null && p.lon != null && p.altitudeMeters != null)
  if (pts.length < 10) return []

  const cumulativeM: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cumulativeM.push(cumulativeM[i - 1] + haversineM(pts[i - 1].lat!, pts[i - 1].lon!, pts[i].lat!, pts[i].lon!))
  }

  const moments: RouteMoment[] = []
  let climbStartIdx: number | null = null

  for (let i = 1; i < pts.length; i++) {
    // Look back to the point ~SMOOTH_WINDOW_M behind, to compute a de-noised local gradient.
    let j = i - 1
    while (j > 0 && cumulativeM[i] - cumulativeM[j] < SMOOTH_WINDOW_M) j--
    const distM = cumulativeM[i] - cumulativeM[j]
    if (distM < 20) continue
    const riseM = pts[i].altitudeMeters! - pts[j].altitudeMeters!
    const gradientPct = (riseM / distM) * 100

    if (gradientPct >= CLIMB_GRADIENT_PCT) {
      if (climbStartIdx == null) climbStartIdx = j
    } else if (climbStartIdx != null) {
      const lengthM = cumulativeM[i] - cumulativeM[climbStartIdx]
      if (lengthM >= CLIMB_MIN_LENGTH_M) {
        moments.push({
          id: `climb-${climbStartIdx}`,
          lat: pts[climbStartIdx].lat!,
          lon: pts[climbStartIdx].lon!,
          distanceAlongRouteM: cumulativeM[climbStartIdx],
          kind: 'climb_start',
          text: 'Da qui il dislivello aumenta parecchio: prenditi il tuo ritmo.',
        })
      }
      climbStartIdx = null
    }
  }

  return moments
}
