// First WCS-backed raster client in the repo (after the WFS-based PAI/PSInSAR clients).
// Two distinct failure modes, not one: (1) DTM_DATASET not configured at all (baseUrl/
// coverageId still null per datasetConfig.ts) is a static fact, known before any network
// call — throws DtmUnavailableError, same contract as PaiUnavailableError/
// PsinsarUnavailableError; (2) dataset configured but no coverage for this specific bbox
// (PST national coverage is partial, or GetCoverage fails with a WCS exception report)
// is a per-request fact — returns null, never throws, because there's nothing anomalous
// to report, it's the normal "no LiDAR here". fetchDtmTile is the single network-aware
// boundary that folds every flavor of (2) — HTTP error, exception report, undecodable
// GeoTIFF — into null.
import { DTM_DATASET } from '@/lib/geo/datasetConfig'
import { wcsGetCoverage } from '@/lib/geo/wcsClient'
import { parseDtmGeoTiff } from '@/lib/dtm/slopeAspect'

export class DtmUnavailableError extends Error {}

export interface DtmTile {
  elevations: Float64Array
  width: number
  height: number
  cellSizeXM: number
  cellSizeYM: number // always in meters, derived from degrees or native units depending on the response CRS
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
}

// Tighter than wcsClient.ts's own 30s default: this runs inside app/api/tei-dtm/route.ts's
// request-scoped fetch, so failing fast matters more than tolerating a slow WCS server
// once one is actually configured.
const DTM_TIMEOUT_MS = 8000

export async function fetchDtmTile(bbox: string): Promise<DtmTile | null> {
  if (!DTM_DATASET.baseUrl || !DTM_DATASET.coverageId) {
    throw new DtmUnavailableError('DTM dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  try {
    const buf = await wcsGetCoverage({
      baseUrl: DTM_DATASET.baseUrl,
      coverageId: DTM_DATASET.coverageId,
      bbox,
      timeoutMs: DTM_TIMEOUT_MS,
    })
    return await parseDtmGeoTiff(buf)
  } catch {
    return null
  }
}
