// Orchestrator bundling uso-suolo (land cover) per segment — the call site lib/tei.ts's
// computeVfond should use. Reuses the DTM playbook: one WCS tile per bbox, then in-memory
// nearest-pixel reads.
//
// UsoSuoloUnavailableError (dataset not configured at all) is intentionally left to
// propagate — same split already established by dtmClient.ts/trailDtmProfile.ts between
// "not configured" and "no data for this request"; app/api/tei-terrain/route.ts is the
// boundary that catches it.
import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { segmentGpx } from '@/lib/tei'
import { fetchUsoSuoloTileCached } from '@/lib/usosuolo/usoSuoloCache'
import { sampleLandCoverAtPoint } from '@/lib/usosuolo/usoSuoloClient'
import { landCoverCodeToSurface, type LandCoverSurface } from '@/lib/tei/landCoverSurfaceMap'

export interface TerrainSegmentSample {
  lat: number
  lon: number
  landCoverSurface: LandCoverSurface
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

  const result: TerrainSegmentSample[] = segments.map((seg) => {
    const classCode = usoSuoloTile ? sampleLandCoverAtPoint(usoSuoloTile, seg.centroid[0], seg.centroid[1]) : null
    return {
      lat: seg.centroid[0],
      lon: seg.centroid[1],
      landCoverSurface: landCoverCodeToSurface(classCode),
    }
  })

  return { source: 'geoportale', segments: result }
}
