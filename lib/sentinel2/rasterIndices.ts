// Pure raster I/O + per-pixel math for the Planetary Computer pipeline — no
// network calls beyond the COG fetch itself (signing/search live in
// planetaryComputerClient.ts). Every band of a given (bbox, targetResolutionM)
// pair is read into an identical {width, height} output grid — derived only
// from the bbox/resolution, never from a band's own native pixel size — so
// formulas that mix 10m and 20m Sentinel-2 bands (NBR, BSI) operate on
// same-shaped arrays without a separate alignment step.
import { fromUrl, type GeoTIFFImage } from 'geotiff'
import proj4 from 'proj4'

export interface GeoBbox {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export interface RasterWindow {
  data: Float64Array
  width: number
  height: number
  bbox: GeoBbox
}

const MASKED_SCL_CLASSES = new Set([3, 8, 9, 10, 11]) // cloud shadow, cloud medium/high prob., thin cirrus, snow/ice

export const MODIS_SINUSOIDAL_PROJ4 = '+proj=sinu +lon_0=0 +x_0=0 +y_0=0 +R=6371007.181 +units=m +no_defs'
const WGS84_PROJ4 = '+proj=longlat +datum=WGS84 +no_defs'

function utmProj4(zone: number, isSouth: boolean): string {
  return `+proj=utm +zone=${zone} +datum=WGS84 +units=m${isSouth ? ' +south' : ''} +no_defs`
}

/** proj4 string for an image's native CRS from its GeoKeys, or null if geographic (lon/lat already, no reprojection needed). */
function projForImage(image: GeoTIFFImage): string | null {
  const keys = image.getGeoKeys()
  if (!keys) return null
  if (keys.GTModelTypeGeoKey === 2) return null

  const epsg = keys.ProjectedCSTypeGeoKey
  if (!epsg) return null

  // UTM north: EPSG 326xx, UTM south: 327xx — derivable without an EPSG database.
  if (epsg >= 32601 && epsg <= 32660) return utmProj4(epsg - 32600, false)
  if (epsg >= 32701 && epsg <= 32760) return utmProj4(epsg - 32700, true)

  return `EPSG:${epsg}`
}

function projectCorner(lon: number, lat: number, toProj: string | null): [number, number] {
  if (!toProj) return [lon, lat]
  return proj4(WGS84_PROJ4, toProj).forward([lon, lat])
}

/**
 * Pixel window for a geo bbox. Sign-agnostic with respect to resolution
 * direction: GeoTIFFImage.getResolution() returns its Y component
 * pre-negated for north-up imagery, so this never assumes a fixed sign —
 * it computes row/col for all four corners from getOrigin()/getResolution()
 * as returned, then takes min/max, mirroring the same defensive pattern
 * GeoTIFFImage.getBoundingBox() itself uses internally.
 */
function pixelWindowForBbox(image: GeoTIFFImage, bbox: GeoBbox, toProj: string | null): [number, number, number, number] {
  const origin = image.getOrigin()
  const resolution = image.getResolution()
  const width = image.getWidth()
  const height = image.getHeight()

  const corners: [number, number][] = [
    [bbox.minLon, bbox.minLat],
    [bbox.minLon, bbox.maxLat],
    [bbox.maxLon, bbox.minLat],
    [bbox.maxLon, bbox.maxLat],
  ].map(([lon, lat]) => projectCorner(lon, lat, toProj))

  const cols = corners.map(([x]) => (x - origin[0]) / resolution[0])
  const rows = corners.map(([, y]) => (y - origin[1]) / resolution[1])

  const left = Math.max(0, Math.floor(Math.min(...cols)))
  const right = Math.min(width, Math.ceil(Math.max(...cols)))
  const top = Math.max(0, Math.floor(Math.min(...rows)))
  const bottom = Math.min(height, Math.ceil(Math.max(...rows)))

  return [left, top, right, bottom]
}

function outputShapeFor(bbox: GeoBbox, targetResolutionM: number): { width: number; height: number } {
  const centerLat = (bbox.minLat + bbox.maxLat) / 2
  const metersPerDegLat = 111320
  const metersPerDegLon = 111320 * Math.cos((centerLat * Math.PI) / 180)

  const widthM = (bbox.maxLon - bbox.minLon) * metersPerDegLon
  const heightM = (bbox.maxLat - bbox.minLat) * metersPerDegLat

  return {
    width: Math.max(1, Math.round(widthM / targetResolutionM)),
    height: Math.max(1, Math.round(heightM / targetResolutionM)),
  }
}

async function readBand(
  signedUrl: string,
  bbox: GeoBbox,
  targetResolutionM: number,
  resampleMethod: 'bilinear' | 'nearest',
  toProj: string | null | 'auto',
): Promise<RasterWindow> {
  const tiff = await fromUrl(signedUrl)
  const image = await tiff.getImage()
  const proj = toProj === 'auto' ? projForImage(image) : toProj
  const window = pixelWindowForBbox(image, bbox, proj)
  const { width, height } = outputShapeFor(bbox, targetResolutionM)

  const rasters = await image.readRasters({ window, width, height, resampleMethod })
  const band = (Array.isArray(rasters) ? rasters[0] : rasters) as ArrayLike<number>

  return { data: Float64Array.from(band), width, height, bbox }
}

/** Reads a Sentinel-2 (or other EPSG-tagged) COG band over a geo bbox, auto-detecting CRS from the file's own GeoKeys. */
export function readWindow(
  signedUrl: string,
  bbox: GeoBbox,
  targetResolutionM: number,
  resampleMethod: 'bilinear' | 'nearest' = 'bilinear',
): Promise<RasterWindow> {
  return readBand(signedUrl, bbox, targetResolutionM, resampleMethod, 'auto')
}

/** Reads a MODIS MOD13Q1 COG band, reprojecting against the fixed sinusoidal grid (non-EPSG, not auto-detectable from GeoKeys). */
export function readModisWindow(
  signedUrl: string,
  bbox: GeoBbox,
  targetResolutionM: number,
): Promise<RasterWindow> {
  return readBand(signedUrl, bbox, targetResolutionM, 'nearest', MODIS_SINUSOIDAL_PROJ4)
}

/** SCL-derived validity mask — true (1) means usable. Caller must read SCL with resampleMethod 'nearest' (categorical data, never 'bilinear'). */
export function maskFromScl(scl: Float64Array): Uint8Array {
  const mask = new Uint8Array(scl.length)
  for (let i = 0; i < scl.length; i++) {
    mask[i] = MASKED_SCL_CLASSES.has(scl[i]) ? 0 : 1
  }
  return mask
}

export function toReflectance(raw: Float64Array, scale: number, offset: number): Float64Array {
  const out = new Float64Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] * scale + offset
  return out
}

/** Copy of data with masked-out (mask[i] === 0) entries replaced by NaN — lets sampleAtPoint read masked pixels back as null instead of a misleading raw value. */
export function applyMask(data: Float64Array, mask: Uint8Array): Float64Array {
  const out = new Float64Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = mask[i] === 0 ? NaN : data[i]
  return out
}

const MODIS_NDVI_FILL = -3000
const MODIS_NDVI_SCALE = 0.0001

/** MOD13Q1 NDVI band -> fraction, mapping the documented fill value (-3000) to NaN. */
export function modisNdviToFraction(raw: Float64Array): Float64Array {
  const out = new Float64Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw[i] === MODIS_NDVI_FILL ? NaN : raw[i] * MODIS_NDVI_SCALE
  }
  return out
}

function vecIndex(fn: (...bands: number[]) => number, ...bands: Float64Array[]): Float64Array {
  const out = new Float64Array(bands[0].length)
  for (let i = 0; i < out.length; i++) out[i] = fn(...bands.map(b => b[i]))
  return out
}

export function ndvi(b08: Float64Array, b04: Float64Array): Float64Array {
  return vecIndex((nir, red) => (nir - red) / (nir + red), b08, b04)
}

export function ndwi(b03: Float64Array, b08: Float64Array): Float64Array {
  return vecIndex((green, nir) => (green - nir) / (green + nir), b03, b08)
}

export function nbr(b08: Float64Array, b12: Float64Array): Float64Array {
  return vecIndex((nir, swir2) => (nir - swir2) / (nir + swir2), b08, b12)
}

export function evi(b08: Float64Array, b04: Float64Array, b02: Float64Array): Float64Array {
  return vecIndex((nir, red, blue) => (2.5 * (nir - red)) / (nir + 6 * red - 7.5 * blue + 1), b08, b04, b02)
}

export function bsi(b11: Float64Array, b04: Float64Array, b08: Float64Array, b02: Float64Array): Float64Array {
  return vecIndex(
    (swir1, red, nir, blue) => (swir1 + red - (nir + blue)) / (swir1 + red + (nir + blue)),
    b11, b04, b08, b02,
  )
}

/** Mean of unmasked, finite pixels — null if none qualify. mask is optional; when omitted, only finite-value filtering applies. */
export function zonalMean(data: Float64Array, mask?: Uint8Array): number | null {
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i++) {
    if (mask && mask[i] === 0) continue
    const v = data[i]
    if (!Number.isFinite(v)) continue
    sum += v
    count++
  }
  return count > 0 ? sum / count : null
}

/** Nearest-pixel extraction from an already-read window at a geo point. Returns null if the point falls outside the window's bbox or the pixel is non-finite. */
export function sampleAtPoint(win: RasterWindow, lat: number, lon: number): number | null {
  const { bbox, width, height, data } = win
  if (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon) return null

  const col = Math.min(width - 1, Math.max(0, Math.floor(((lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * width)))
  const row = Math.min(height - 1, Math.max(0, Math.floor(((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * height)))

  const v = data[row * width + col]
  return Number.isFinite(v) ? v : null
}
