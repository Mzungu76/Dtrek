// DTM raster client (after the pivot off TINITALY/WCS — see lib/dtm/openTopographyClient.ts).
// Two distinct failure modes, not one: (1) OPENTOPOGRAPHY_API_KEY not set at all is a static
// fact, known before any network call — throws DtmUnavailableError, same contract as
// PaiUnavailableError; (2) key set but no coverage for this specific
// bbox (e.g. the API answers with an error for this dataset/area) is a per-request fact —
// returns null, never throws, because there's nothing anomalous to report, it's the normal
// "no DTM here". fetchDtmTile is the single network-aware boundary that folds every flavor of
// (2) — HTTP error, rate limit, undecodable GeoTIFF — into null.
import { fetchGlobalDem } from '@/lib/dtm/openTopographyClient'
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

// Tighter than openTopographyClient.ts's own 30s default: this runs inside
// app/api/tei-dtm/route.ts's request-scoped fetch, so failing fast matters more than
// tolerating a slow upstream once one is actually configured.
const DTM_TIMEOUT_MS = 8000

export async function fetchDtmTile(bbox: string): Promise<DtmTile | null> {
  if (!process.env.OPENTOPOGRAPHY_API_KEY) {
    throw new DtmUnavailableError('OPENTOPOGRAPHY_API_KEY not set (see .env.example)')
  }

  try {
    const buf = await fetchGlobalDem(bbox, { timeoutMs: DTM_TIMEOUT_MS })
    return await parseDtmGeoTiff(buf)
  } catch {
    return null
  }
}
