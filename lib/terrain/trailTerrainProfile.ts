// Orchestrator bundling uso-suolo (land cover) + geologia (litologia/rockfall) per segment —
// the call site lib/tei.ts's computeVfond (and the future rockfall SI signal) should use.
// Unlike trailDtmProfile.ts's 15m dense sampling (one tile fetch, then in-memory reads),
// geologia is a per-point WMS query with a real network round-trip each time — sampling at
// segmentGpx's ~100m granularity (not 15m) keeps the call count bounded to roughly one per
// TEI segment, not one per dense GPX point. Land cover instead reuses the DTM playbook: one
// WCS tile per bbox, then in-memory nearest-pixel reads.
//
// GeologiaUnavailableError/UsoSuoloUnavailableError (dataset not configured at all) are
// intentionally left to propagate — same split already established by dtmClient.ts/
// trailDtmProfile.ts between "not configured" and "no data for this request";
// app/api/tei-terrain/route.ts is the boundary that catches them.
import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { segmentGpx } from '@/lib/tei'
import { fetchGeologiaAtPointsCached } from '@/lib/geologia/geologiaCache'
import { fetchUsoSuoloTileCached } from '@/lib/usosuolo/usoSuoloCache'
import { sampleLandCoverAtPoint } from '@/lib/usosuolo/usoSuoloClient'
import { landCoverCodeToSurface, type LandCoverSurface } from '@/lib/tei/landCoverSurfaceMap'
import type { RockfallRisk } from '@/lib/geologia/lithologyRiskMap'

export interface TerrainSegmentSample {
  lat: number
  lon: number
  landCoverSurface: LandCoverSurface
  rockfallRisk: RockfallRisk
}

export interface TrailTerrainProfile {
  source: 'geoportale' | 'unavailable'
  segments: TerrainSegmentSample[]
}

const TILE_BUFFER_M = 50

const UNAVAILABLE: TrailTerrainProfile = { source: 'unavailable', segments: [] }

export async function computeTrailTerrainProfile(track: [number, number][]): Promise<TrailTerrainProfile> {
  if (track.length < 2) return UNAVAILABLE

  const segments = segmentGpx(track)
  if (segments.length === 0) return UNAVAILABLE

  const bbox = bboxBufferMeters(track, TILE_BUFFER_M)
  const usoSuoloTile = await fetchUsoSuoloTileCached(bbox)

  const geologiaFeatures = await fetchGeologiaAtPointsCached(
    segments.map(seg => [seg.centroid[0], seg.centroid[1]])
  )

  const result: TerrainSegmentSample[] = segments.map((seg, i) => {
    const classCode = usoSuoloTile ? sampleLandCoverAtPoint(usoSuoloTile, seg.centroid[0], seg.centroid[1]) : null
    const feature = geologiaFeatures[i]
    return {
      lat: seg.centroid[0],
      lon: seg.centroid[1],
      landCoverSurface: landCoverCodeToSurface(classCode),
      rockfallRisk: feature?.rockfallRisk ?? 'unknown',
    }
  })

  return { source: 'geoportale', segments: result }
}
