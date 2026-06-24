// Land-cover client — same dual-failure-mode shape as lib/dtm/dtmClient.ts (the other WCS-
// backed raster client in the repo): USO_SUOLO_DATASET not configured (baseUrl/coverageId
// still null per datasetConfig.ts) is a static fact -> throws UsoSuoloUnavailableError;
// configured but the WCS GetCoverage/GeoTIFF decode fails for this bbox is a per-request
// fact -> returns null. No Horn's-method-style kernel needed here (unlike dtmClient.ts's
// slopeAspect.ts) — the band carries a categorical land-cover class code per pixel, so
// decode + nearest-pixel sampling live together in this one file.
import { fromArrayBuffer } from 'geotiff'
import { USO_SUOLO_DATASET } from '@/lib/geo/datasetConfig'
import { wcsGetCoverage } from '@/lib/geo/wcsClient'

export class UsoSuoloUnavailableError extends Error {}

export interface UsoSuoloTile {
  classCodes: Float64Array // raw band values; nomenclature unconfirmed, see lib/tei/landCoverSurfaceMap.ts
  width: number
  height: number
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number }
}

// Same budget reasoning as DTM_TIMEOUT_MS in dtmClient.ts.
const USO_SUOLO_TIMEOUT_MS = 8000

// Geographic CRS only — mirrors dtmClient.ts/slopeAspect.ts's geographic branch (the
// wcsClient.ts default outputCrs). Extend with the projected-CRS corner-reprojection branch
// only if a real endpoint ever forces outputCrs away from that default.
async function parseUsoSuoloGeoTiff(buf: ArrayBuffer): Promise<UsoSuoloTile | null> {
  try {
    const tiff = await fromArrayBuffer(buf)
    const image = await tiff.getImage()
    const width = image.getWidth()
    const height = image.getHeight()
    const origin = image.getOrigin()
    const resolution = image.getResolution()

    const rasters = await image.readRasters()
    const band = (Array.isArray(rasters) ? rasters[0] : rasters) as ArrayLike<number>
    const classCodes = Float64Array.from(band)

    const x0 = origin[0]
    const y0 = origin[1]
    const x1 = x0 + width * resolution[0]
    const y1 = y0 + height * resolution[1]

    const minLon = Math.min(x0, x1)
    const maxLon = Math.max(x0, x1)
    const minLat = Math.min(y0, y1)
    const maxLat = Math.max(y0, y1)

    return { classCodes, width, height, bbox: { minLat, maxLat, minLon, maxLon } }
  } catch {
    return null
  }
}

export async function fetchUsoSuoloTile(bbox: string): Promise<UsoSuoloTile | null> {
  if (!USO_SUOLO_DATASET.baseUrl || !USO_SUOLO_DATASET.coverageId) {
    throw new UsoSuoloUnavailableError('Uso suolo dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  try {
    const buf = await wcsGetCoverage({
      baseUrl: USO_SUOLO_DATASET.baseUrl,
      coverageId: USO_SUOLO_DATASET.coverageId,
      bbox,
      timeoutMs: USO_SUOLO_TIMEOUT_MS,
    })
    return await parseUsoSuoloGeoTiff(buf)
  } catch {
    return null
  }
}

/** Nearest-pixel land-cover class code at a geo point. Returns null if the point falls outside the tile's bbox — never extrapolates. */
export function sampleLandCoverAtPoint(tile: UsoSuoloTile, lat: number, lon: number): number | null {
  const { bbox, width, height } = tile
  if (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon) return null

  const col = Math.min(width - 1, Math.max(0, Math.floor(((lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * width)))
  const row = Math.min(height - 1, Math.max(0, Math.floor(((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * height)))

  return tile.classCodes[row * width + col]
}
