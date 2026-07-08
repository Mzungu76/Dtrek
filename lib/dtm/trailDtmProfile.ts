// Orchestrator — the only call site `lib/tei.ts`/`lib/trailScore.ts` consumers should ever
// need. Samples the dense original GPX track (never geometry_simplified — see module-level
// note on call sites) every 15m, fetches a single DTM tile for the track's bbox (+50m buffer
// so edge samples don't fall just outside the tile), then reads slope/aspect at each sample
// point in memory. DtmUnavailableError (dataset not configured at all) is intentionally left
// to propagate — app/api/tei-dtm/route.ts is the boundary that catches it, same split as
// fetchDtmTile/parseDtmGeoTiff already establish between "not configured" and "no coverage here".
import { sampleEveryNMeters } from '@/lib/trailStats'
import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { fetchDtmTileCached } from '@/lib/dtm/dtmCache'
import { sampleSlopeAspectAtPoint } from '@/lib/dtm/slopeAspect'

export interface DtmProfilePoint {
  lat: number
  lon: number
  slopeDeg: number
  aspectDeg: number // NaN if the underlying cell is flat
}

export interface TrailDtmProfile {
  source: 'dtm' | 'unavailable'
  points: DtmProfilePoint[]
  avgSlopeDeg: number | null
  maxSlopeDeg: number | null
}

const SAMPLE_INTERVAL_M = 15
const TILE_BUFFER_M = 50

const UNAVAILABLE: TrailDtmProfile = { source: 'unavailable', points: [], avgSlopeDeg: null, maxSlopeDeg: null }

export async function computeTrailDtmProfile(track: [number, number][]): Promise<TrailDtmProfile> {
  if (track.length === 0) return UNAVAILABLE

  const sampled = sampleEveryNMeters(track, SAMPLE_INTERVAL_M)
  const bbox = bboxBufferMeters(track, TILE_BUFFER_M)

  const tile = await fetchDtmTileCached(bbox)
  if (!tile) return UNAVAILABLE

  const points: DtmProfilePoint[] = []
  for (const [lat, lon] of sampled) {
    const sample = sampleSlopeAspectAtPoint(tile, lat, lon)
    if (sample) points.push({ lat, lon, slopeDeg: sample.slopeDeg, aspectDeg: sample.aspectDeg })
  }
  if (points.length === 0) return UNAVAILABLE

  const slopes = points.map(p => p.slopeDeg)
  const avgSlopeDeg = slopes.reduce((a, b) => a + b, 0) / slopes.length
  const maxSlopeDeg = Math.max(...slopes)

  return { source: 'dtm', points, avgSlopeDeg, maxSlopeDeg }
}
