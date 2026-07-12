// Satellite signal collector — Sentinel-2 vegetation/water/burn/soil indices
// via Microsoft Planetary Computer (MPC): STAC search finds the best scene,
// a SAS token signs the band assets, and the indices are computed locally
// from raw COG windows (see lib/sentinel2/rasterIndices.ts). MPC's STAC/SAS
// endpoints are public for low-volume use, so unlike the old CDSE OAuth2
// flow this collector has no credentials gate — it always attempts a call.
import type { SatelliteSignal, SignalContext } from '@/lib/cl/types'
import {
  searchStac, getSasToken, signAssetHref, assetHref, bandScaleFor,
  MpcUnreachableError, type StacBbox, type StacItem,
} from '@/lib/sentinel2/planetaryComputerClient'
import {
  readWindow, maskFromScl, toReflectance, ndvi, ndwi, nbr, evi, bsi, zonalMean,
  type GeoBbox,
} from '@/lib/sentinel2/rasterIndices'
import { PaiUnavailableError, type PaiFeature, type PaiRiskType } from '@/lib/pai/paiClient'
import { fetchPaiPolygonsCached } from '@/lib/pai/paiCache'
import { segmentIntersectsPolygon } from '@/lib/geo/pointInPolygon'
import { GeologiaUnavailableError } from '@/lib/geologia/geologiaClient'
import { fetchGeologiaAtPointsCached } from '@/lib/geologia/geologiaCache'
import type { RockfallRisk } from '@/lib/geologia/lithologyRiskMap'

const COLLECTION = 'sentinel-2-l2a'
// ctx.bbox can span an entire trail (no size cap), so this matches the
// resolution the old CDSE Statistics API call used (resx/resy=60) rather
// than a band's native 10/20m — keeps the read grid bounded for long trails.
const TARGET_RESOLUTION_M = 60
const MAX_CLOUD_COVER = 60

function toStacBbox(bbox: SignalContext['bbox']): StacBbox {
  return [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
}

// "s,w,n,e" — same convention as geoUtils.ts's computeBbox / lib/geo/wfsClient.ts.
function toPaiBbox(bbox: SignalContext['bbox']): string {
  return `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`
}

const PAI_RISK_RANK: Record<string, number> = { R1: 1, P1: 1, R2: 2, P2: 2, R3: 3, P3: 3, R4: 4, P4: 4, unknown: 1 }
const PAI_RISK_PENALTY: Record<string, number> = { R1: -5, P1: -5, R2: -15, P2: -15, R3: -35, P3: -35, R4: -60, P4: -60, unknown: -5 }

// Worst (highest-rank) PAI polygon of `riskType` that actually intersects the trail
// geometry — ctx.geometry is the sparse geometry_simplified polyline (see computeCL.ts),
// so this checks every consecutive pair, not just whether a vertex lands inside.
function worstPaiIntersection(features: PaiFeature[], riskType: PaiRiskType, geometry: [number, number][]): PaiFeature | null {
  let worst: PaiFeature | null = null
  let worstRank = 0
  for (const f of features) {
    if (f.riskType !== riskType) continue
    const rank = PAI_RISK_RANK[f.riskClass] ?? 1
    if (rank <= worstRank) continue
    for (let i = 0; i < geometry.length - 1; i++) {
      const [latA, lonA] = geometry[i]
      const [latB, lonB] = geometry[i + 1]
      if (segmentIntersectsPolygon(latA, lonA, latB, lonB, f.geometry)) {
        worst = f
        worstRank = rank
        break
      }
    }
  }
  return worst
}

interface PaiOverride {
  landslidePenalty: number | null // null = no PAI polygon found, caller falls back to BSI
  landslideClass: string | null
  floodPenalty: number | null     // null = no PAI polygon found, caller falls back to NDWI
  floodClass: string | null
}

const NO_PAI_OVERRIDE: PaiOverride = { landslidePenalty: null, landslideClass: null, floodPenalty: null, floodClass: null }

// Never rejects — PaiUnavailableError is the expected steady state until
// lib/geo/datasetConfig.ts's PAI_DATASET is populated with a real endpoint, and any
// other failure (network, bad schema) must degrade to the existing satellite heuristic
// exactly the same way, not break the whole collector.
async function fetchPaiOverride(ctx: SignalContext): Promise<PaiOverride> {
  try {
    const features = await fetchPaiPolygonsCached(toPaiBbox(ctx.bbox))
    const landslide = worstPaiIntersection(features, 'landslide', ctx.geometry)
    const flood = worstPaiIntersection(features, 'flood', ctx.geometry)
    return {
      landslidePenalty: landslide ? PAI_RISK_PENALTY[landslide.riskClass] ?? -5 : null,
      landslideClass: landslide?.riskClass ?? null,
      floodPenalty: flood ? PAI_RISK_PENALTY[flood.riskClass] ?? -5 : null,
      floodClass: flood?.riskClass ?? null,
    }
  } catch (err) {
    if (!(err instanceof PaiUnavailableError)) console.error('[si] PAI fetch failed', err)
    return NO_PAI_OVERRIDE
  }
}

const ROCKFALL_RISK_RANK: Record<RockfallRisk, number> = { unknown: 0, low: 1, medium: 2, high: 3 }
const ROCKFALL_RISK_PENALTY: Record<RockfallRisk, number> = { unknown: 0, low: -5, medium: -20, high: -45 }

interface RockfallOverride {
  penalty: number       // 0 until a non-'unknown' risk is found anywhere along the trail
  riskClass: RockfallRisk
}

const NO_ROCKFALL: RockfallOverride = { penalty: 0, riskClass: 'unknown' }

// One WMS GetFeatureInfo call per vertex of ctx.geometry (the sparse geometry_simplified
// polyline, ~200m spacing) run in parallel — same per-point query shape as
// lib/terrain/trailTerrainProfile.ts, just against SI's sparser geometry instead of TEI's
// ~100m segments. GeologiaUnavailableError (dataset not configured) is the expected steady
// state until GEOLOGIA_DATASET is populated — degrades silently to "no rockfall signal",
// same precedent as fetchPaiOverride above. lithologyCodeToRockfallRisk always returns
// 'unknown' today (real geological-domain gap, see lithologyRiskMap.ts), so in practice this
// stays a no-op until that mapping is populated even once the dataset is live.
async function fetchRockfallOverride(ctx: SignalContext): Promise<RockfallOverride> {
  try {
    const features = await fetchGeologiaAtPointsCached(ctx.geometry)
    let worst: RockfallRisk = 'unknown'
    for (const f of features) {
      const risk = f?.rockfallRisk ?? 'unknown'
      if (ROCKFALL_RISK_RANK[risk] > ROCKFALL_RISK_RANK[worst]) worst = risk
    }
    return { penalty: ROCKFALL_RISK_PENALTY[worst], riskClass: worst }
  } catch (err) {
    if (!(err instanceof GeologiaUnavailableError)) console.error('[si] Geologia fetch failed', err)
    return NO_ROCKFALL
  }
}

// Additive only (no predecessor to override) — a no-op when riskClass is still 'unknown',
// same "absence of data is silence, not a value" rule PAI already follows.
function applyRockfall(signal: SatelliteSignal, rockfall: RockfallOverride): SatelliteSignal {
  if (rockfall.riskClass === 'unknown') return signal
  return { ...signal, rockfallPenalty: rockfall.penalty, rockfallSource: 'geologia', rockfallClass: rockfall.riskClass }
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
    available: false, ndviDeltaPenalty: 0, ndviAbsolutePenalty: 0, firePenalty: 0,
    floodPenalty: 0, landslidePenalty: 0, landslideSource: 'none', floodSource: 'none',
    rockfallPenalty: 0, rockfallSource: 'none',
  }

  // Both run alongside the Sentinel-2 fetch below (not awaited until needed) so neither
  // lookup adds latency on top of the MPC round-trip. Independent of whether Sentinel-2
  // itself succeeds — see the catch block, where a PAI/rockfall hit still counts even if
  // MPC is unreachable.
  const paiPromise = fetchPaiOverride(ctx)
  const rockfallPromise = fetchRockfallOverride(ctx)

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
    if (!currentItem) {
      const [pai, rockfall] = await Promise.all([paiPromise, rockfallPromise])
      return applyRockfall(applyPaiOverride({ ...neutral, reason: 'no_data' }, pai), rockfall)
    }

    const [current, ndviPrior] = await Promise.all([
      computeCombinedIndices(currentItem, ctx.bbox),
      priorItem ? computeNdviOnly(priorItem, ctx.bbox) : Promise.resolve(null),
    ])

    const ndviCurrent = current.ndvi
    const ndviDelta = ndviCurrent != null && ndviPrior != null ? ndviCurrent - ndviPrior : null
    const [pai, rockfall] = await Promise.all([paiPromise, rockfallPromise])

    return applyRockfall(applyPaiOverride({
      available: true,
      ndviDeltaPenalty: ndviDeltaPenaltyFor(ndviDelta),
      ndviAbsolutePenalty: ndviAbsolutePenaltyFor(ndviCurrent),
      firePenalty: firePenaltyFor(current.nbr),
      floodPenalty: floodPenaltyFor(current.ndwi),
      landslidePenalty: landslidePenaltyFor(current.bsi),
      landslideSource: current.bsi != null ? 'bsi' : 'none',
      floodSource: current.ndwi != null ? 'ndwi' : 'none',
      rockfallPenalty: 0,
      rockfallSource: 'none',
    }, pai), rockfall)
  } catch (err) {
    console.error('[si] Planetary Computer satellite signal failed', err)
    // An official PAI/rockfall hit is authoritative regardless of whether the Sentinel-2
    // heuristic itself ran — don't lose it just because MPC is down.
    const [pai, rockfall] = await Promise.all([paiPromise, rockfallPromise])
    return applyRockfall(applyPaiOverride({ ...neutral, reason: err instanceof MpcUnreachableError ? 'unreachable' : 'api_error' }, pai), rockfall)
  }
}

// Substitutes (never sums with) the BSI/NDWI-derived penalty when an official PAI
// polygon intersects the trail — same precedence rule for both risk types.
function applyPaiOverride(signal: SatelliteSignal, pai: PaiOverride): SatelliteSignal {
  if (pai.landslidePenalty == null && pai.floodPenalty == null) return signal
  return {
    ...signal,
    landslidePenalty: pai.landslidePenalty ?? signal.landslidePenalty,
    landslideSource: pai.landslidePenalty != null ? 'pai' : signal.landslideSource,
    paiLandslideClass: pai.landslideClass ?? undefined,
    floodPenalty: pai.floodPenalty ?? signal.floodPenalty,
    floodSource: pai.floodPenalty != null ? 'pai' : signal.floodSource,
    paiFloodClass: pai.floodClass ?? undefined,
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
