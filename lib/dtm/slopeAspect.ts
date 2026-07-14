// First in-memory GeoTIFF decode in the repo — this decodes raw OpenTopography globaldem
// response bytes already held in memory via fromArrayBuffer, rather than geotiff's fromUrl
// (whole pre-published COGs) used elsewhere. Horn's method
// slope/aspect kernel (same algorithm as gdaldem slope/QGIS), pure math beyond the initial
// decode — no network calls past parseDtmGeoTiff.
import { fromArrayBuffer, type GeoTIFFImage } from 'geotiff'
import { proj4 } from '@/lib/geo/projections' // side-effect: registers EPSG:32632/33/3003/3004 defs
import { metersPerDegreeAt } from '@/lib/geo/bufferUtils'
import type { DtmTile } from '@/lib/dtm/dtmClient'

const WGS84_PROJ4 = '+proj=longlat +datum=WGS84 +no_defs'

function utmProj4(zone: number, isSouth: boolean): string {
  return `+proj=utm +zone=${zone} +datum=WGS84 +units=m${isSouth ? ' +south' : ''} +no_defs`
}

/** proj4 string for the image's native CRS from its GeoKeys, or null if geographic (degrees, no reprojection needed). */
function projForImage(image: GeoTIFFImage): string | null {
  const keys = image.getGeoKeys()
  if (!keys) return null
  if (keys.GTModelTypeGeoKey === 2) return null

  const epsg = keys.ProjectedCSTypeGeoKey
  if (!epsg) return null

  if (epsg >= 32601 && epsg <= 32660) return utmProj4(epsg - 32600, false)
  if (epsg >= 32701 && epsg <= 32760) return utmProj4(epsg - 32700, true)

  return `EPSG:${epsg}`
}

/**
 * Decodes an OpenTopography globaldem response (raw GeoTIFF bytes) into a DtmTile. Returns
 * null (never throws) on any decode failure — undecodable bytes are a per-request fact, not
 * a configuration error; dtmClient.ts's fetchDtmTile is the boundary that distinguishes this
 * from "not configured".
 *
 * Handles both CRS cases: geographic (EPSG:4326, the format OpenTopography's GTiff output
 * uses — degree resolution converted to meters via metersPerDegreeAt) and projected (native
 * meter resolution — proj4 used only to reproject the tile's corners to WGS84 for
 * DtmTile.bbox), kept for robustness in case a future demtype or outputCrs choice returns a
 * projected GeoTIFF.
 */
export async function parseDtmGeoTiff(buf: ArrayBuffer): Promise<DtmTile | null> {
  try {
    const tiff = await fromArrayBuffer(buf)
    const image = await tiff.getImage()
    const width = image.getWidth()
    const height = image.getHeight()
    const origin = image.getOrigin()
    const resolution = image.getResolution()
    const proj = projForImage(image)

    const rasters = await image.readRasters()
    const band = (Array.isArray(rasters) ? rasters[0] : rasters) as ArrayLike<number>
    const elevations = Float64Array.from(band)

    const x0 = origin[0]
    const y0 = origin[1]
    const x1 = x0 + width * resolution[0]
    const y1 = y0 + height * resolution[1]

    let minLat: number, maxLat: number, minLon: number, maxLon: number
    let cellSizeXM: number, cellSizeYM: number

    if (!proj) {
      minLon = Math.min(x0, x1)
      maxLon = Math.max(x0, x1)
      minLat = Math.min(y0, y1)
      maxLat = Math.max(y0, y1)
      const { lat: mPerDegLat, lon: mPerDegLon } = metersPerDegreeAt((minLat + maxLat) / 2)
      cellSizeXM = Math.abs(resolution[0]) * mPerDegLon
      cellSizeYM = Math.abs(resolution[1]) * mPerDegLat
    } else {
      const [lon0, lat0] = proj4(proj, WGS84_PROJ4).forward([x0, y0])
      const [lon1, lat1] = proj4(proj, WGS84_PROJ4).forward([x1, y1])
      minLon = Math.min(lon0, lon1)
      maxLon = Math.max(lon0, lon1)
      minLat = Math.min(lat0, lat1)
      maxLat = Math.max(lat0, lat1)
      cellSizeXM = Math.abs(resolution[0])
      cellSizeYM = Math.abs(resolution[1])
    }

    return { elevations, width, height, cellSizeXM, cellSizeYM, bbox: { minLat, maxLat, minLon, maxLon } }
  } catch {
    return null
  }
}

function clampIdx(i: number, maxInclusive: number): number {
  return Math.max(0, Math.min(maxInclusive, i))
}

function elevAt(tile: DtmTile, row: number, col: number): number {
  const r = clampIdx(row, tile.height - 1)
  const c = clampIdx(col, tile.width - 1)
  return tile.elevations[r * tile.width + c]
}

/**
 * Horn's method 3x3 kernel at (row, col). Grid convention (matches this module's own
 * parseDtmGeoTiff bbox): row 0 = north edge (row increases southward), col 0 = west edge (col
 * increases eastward). Border cells are replicate-clamped (elevAt), not given a special branch.
 *
 * aspectDeg is the compass bearing (0=N, 90=E, clockwise) of the downslope direction;
 * NaN for a perfectly flat cell, where no direction is defined. Validated against a
 * hand-built synthetic tilted plane (10°, N-S and E-W) before being wired to any caller —
 * an axis-swap here would silently corrupt V_topo/V_geo without ever throwing.
 */
export function slopeAt(tile: DtmTile, row: number, col: number): { slopeDeg: number; aspectDeg: number } {
  const nw = elevAt(tile, row - 1, col - 1)
  const n = elevAt(tile, row - 1, col)
  const ne = elevAt(tile, row - 1, col + 1)
  const w = elevAt(tile, row, col - 1)
  const e = elevAt(tile, row, col + 1)
  const sw = elevAt(tile, row + 1, col - 1)
  const s = elevAt(tile, row + 1, col)
  const se = elevAt(tile, row + 1, col + 1)

  const dzdx = ((ne + 2 * e + se) - (nw + 2 * w + sw)) / (8 * tile.cellSizeXM)
  const dzdy = ((nw + 2 * n + ne) - (sw + 2 * s + se)) / (8 * tile.cellSizeYM)

  const slopeDeg = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180 / Math.PI

  if (dzdx === 0 && dzdy === 0) return { slopeDeg, aspectDeg: NaN }

  let aspectDeg = Math.atan2(-dzdx, -dzdy) * 180 / Math.PI
  if (aspectDeg < 0) aspectDeg += 360
  return { slopeDeg, aspectDeg }
}

/** Nearest-pixel slope/aspect at a geo point. Returns null if the point falls outside the tile's bbox — never extrapolates. */
export function sampleSlopeAspectAtPoint(tile: DtmTile, lat: number, lon: number): { slopeDeg: number; aspectDeg: number } | null {
  const { bbox, width, height } = tile
  if (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon) return null

  const col = Math.min(width - 1, Math.max(0, Math.floor(((lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * width)))
  const row = Math.min(height - 1, Math.max(0, Math.floor(((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * height)))

  return slopeAt(tile, row, col)
}

/**
 * Nearest-pixel elevation (meters) at a geo point — same row/col mapping as
 * sampleSlopeAspectAtPoint, used to attach altitudeMeters to bare OSM geometry (no elevation of
 * its own) instead of computing a derived value like slope. Returns null outside the tile's bbox.
 */
export function elevationAtPoint(tile: DtmTile, lat: number, lon: number): number | null {
  const { bbox, width, height } = tile
  if (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon) return null

  const col = Math.min(width - 1, Math.max(0, Math.floor(((lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * width)))
  const row = Math.min(height - 1, Math.max(0, Math.floor(((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * height)))

  const v = elevAt(tile, row, col)
  return Number.isFinite(v) ? v : null
}
