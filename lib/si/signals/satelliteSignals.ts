// Satellite signal collector — Sentinel-2 vegetation/water/burn/soil indices
// via Microsoft Planetary Computer (MPC): STAC search finds the best scene,
// a SAS token signs the band assets, and the indices are computed locally
// from raw COG windows (see lib/sentinel2/rasterIndices.ts). MPC's STAC/SAS
// endpoints are public for low-volume use, so unlike the old CDSE OAuth2
// flow this collector has no credentials gate — it always attempts a call.
import type { SatelliteSignal, SignalContext } from '@/lib/si/types'
import {
  searchStac, getSasToken, signAssetHref, assetHref, bandScaleFor,
  MpcUnreachableError, type StacBbox, type StacItem,
} from '@/lib/sentinel2/planetaryComputerClient'
import {
  readWindow, maskFromScl, toReflectance, ndvi, ndwi, nbr, evi, bsi, zonalMean,
  type GeoBbox,
} from '@/lib/sentinel2/rasterIndices'

const COLLECTION = 'sentinel-2-l2a'
// ctx.bbox can span an entire trail (no size cap), so this matches the
// resolution the old CDSE Statistics API call used (resx/resy=60) rather
// than a band's native 10/20m — keeps the read grid bounded for long trails.
const TARGET_RESOLUTION_M = 60
const MAX_CLOUD_COVER = 60

function toStacBbox(bbox: SignalContext['bbox']): StacBbox {
  return [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
}

interface SceneIndices {
  ndvi: number | null
  ndwi: number | null
  nbr: number | null
  evi: number | null
  bsi: number | null
}

async function readBand(item: StacItem, bandId: string, bbox: GeoBbox, resampleMethod: 'bilinear' | 'nearest' = 'bilinear') {
  const href = assetHref(item, bandId)
  if (!href) return null
  const sas = await getSasToken(href)
  const win = await readWindow(signAssetHref(href, sas), bbox, TARGET_RESOLUTION_M, resampleMethod)
  return { win, bandScale: bandScaleFor(item, bandId) }
}

async function computeCombinedIndices(item: StacItem, bbox: GeoBbox): Promise<SceneIndices> {
  const [b02, b03, b04, b08, b11, b12, scl] = await Promise.all([
    readBand(item, 'B02', bbox), readBand(item, 'B03', bbox), readBand(item, 'B04', bbox),
    readBand(item, 'B08', bbox), readBand(item, 'B11', bbox), readBand(item, 'B12', bbox),
    readBand(item, 'SCL', bbox, 'nearest'),
  ])
  if (!b02 || !b03 || !b04 || !b08 || !b11 || !b12 || !scl) {
    return { ndvi: null, ndwi: null, nbr: null, evi: null, bsi: null }
  }

  const mask = maskFromScl(scl.win.data)
  const r02 = toReflectance(b02.win.data, b02.bandScale.scale, b02.bandScale.offset)
  const r03 = toReflectance(b03.win.data, b03.bandScale.scale, b03.bandScale.offset)
  const r04 = toReflectance(b04.win.data, b04.bandScale.scale, b04.bandScale.offset)
  const r08 = toReflectance(b08.win.data, b08.bandScale.scale, b08.bandScale.offset)
  const r11 = toReflectance(b11.win.data, b11.bandScale.scale, b11.bandScale.offset)
  const r12 = toReflectance(b12.win.data, b12.bandScale.scale, b12.bandScale.offset)

  return {
    ndvi: zonalMean(ndvi(r08, r04), mask),
    ndwi: zonalMean(ndwi(r03, r08), mask),
    nbr: zonalMean(nbr(r08, r12), mask),
    evi: zonalMean(evi(r08, r04, r02), mask),
    bsi: zonalMean(bsi(r11, r04, r08, r02), mask),
  }
}

async function computeNdviOnly(item: StacItem, bbox: GeoBbox): Promise<number | null> {
  const [b04, b08, scl] = await Promise.all([
    readBand(item, 'B04', bbox), readBand(item, 'B08', bbox), readBand(item, 'SCL', bbox, 'nearest'),
  ])
  if (!b04 || !b08 || !scl) return null
  const mask = maskFromScl(scl.win.data)
  const r04 = toReflectance(b04.win.data, b04.bandScale.scale, b04.bandScale.offset)
  const r08 = toReflectance(b08.win.data, b08.bandScale.scale, b08.bandScale.offset)
  return zonalMean(ndvi(r08, r04), mask)
}

export async function collectSatelliteSignal(_osmRelationId: number, ctx: SignalContext): Promise<SatelliteSignal> {
  const neutral: SatelliteSignal = {
    available: false, ndviDeltaPenalty: 0, ndviAbsolutePenalty: 0, firePenalty: 0, floodPenalty: 0, landslidePenalty: 0,
  }

  try {
    const now = new Date()
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    const priorEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const priorStart = new Date(priorEnd.getTime() - 10 * 24 * 60 * 60 * 1000)
    const stacBbox = toStacBbox(ctx.bbox)

    const [currentItem, priorItem] = await Promise.all([
      searchStac(COLLECTION, stacBbox, tenDaysAgo, now, { maxCloudCover: MAX_CLOUD_COVER }),
      searchStac(COLLECTION, stacBbox, priorStart, priorEnd, { maxCloudCover: MAX_CLOUD_COVER }),
    ])
    if (!currentItem) return { ...neutral, reason: 'no_data' }

    const [current, ndviPrior] = await Promise.all([
      computeCombinedIndices(currentItem, ctx.bbox),
      priorItem ? computeNdviOnly(priorItem, ctx.bbox) : Promise.resolve(null),
    ])

    const ndviCurrent = current.ndvi
    const ndviDelta = ndviCurrent != null && ndviPrior != null ? ndviCurrent - ndviPrior : null

    return {
      available: true,
      ndviDeltaPenalty: ndviDeltaPenaltyFor(ndviDelta),
      ndviAbsolutePenalty: ndviAbsolutePenaltyFor(ndviCurrent),
      firePenalty: firePenaltyFor(current.nbr),
      floodPenalty: floodPenaltyFor(current.ndwi),
      landslidePenalty: landslidePenaltyFor(current.bsi),
    }
  } catch (err) {
    console.error('[si] Planetary Computer satellite signal failed', err)
    return { ...neutral, reason: err instanceof MpcUnreachableError ? 'unreachable' : 'api_error' }
  }
}

function ndviDeltaPenaltyFor(delta: number | null): number {
  if (delta == null) return 0
  const abs = Math.abs(delta)
  if (abs < 0.05) return 0
  if (abs < 0.10) return -10
  if (abs < 0.20) return -20
  return -35
}

function ndviAbsolutePenaltyFor(ndvi: number | null): number {
  if (ndvi == null) return 0
  if (ndvi < 0.5) return 0
  if (ndvi <= 0.7) return -5
  return -15
}

function firePenaltyFor(nbr: number | null): number {
  if (nbr == null) return 0
  if (nbr < -0.1) return -50
  if (nbr < -0.05) return -25
  return 0
}

function floodPenaltyFor(ndwi: number | null): number {
  if (ndwi == null) return 0
  if (ndwi > 0.3) return -30
  if (ndwi > 0.2) return -15
  return 0
}

function landslidePenaltyFor(bsi: number | null): number {
  if (bsi == null) return 0
  if (bsi > 0.5) return -25
  if (bsi > 0.3) return -10
  return 0
}
