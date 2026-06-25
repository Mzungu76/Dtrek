// Sentinel-2 enrichment — phenology (monthly NDVI), landscape variety, shade
// estimate, water sources, and hazard flags for the trail detail panel.
// Pulls Sentinel-2 (snapshot/hazard indices) and MODIS MOD13Q1 (monthly
// phenology) from Microsoft Planetary Computer. No import from lib/si: both
// this module and lib/si/signals/satelliteSignals.ts import the shared MPC
// client/raster helpers independently (mirrors the old getCdseToken sharing,
// just pointed at the new shared modules instead of at each other).
import { supabase } from '@/lib/supabase'
import { haversineM, computeBbox } from '@/lib/geoUtils'
import {
  searchStac, getSasToken, signAssetHref, assetHref, bandScaleFor,
  MpcUnreachableError, type StacBbox, type StacItem,
} from '@/lib/sentinel2/planetaryComputerClient'
import {
  readWindow, readModisWindow, maskFromScl, toReflectance, modisNdviToFraction, applyMask,
  ndvi, ndwi, nbr, evi, bsi, zonalMean, sampleAtPoint,
  type GeoBbox, type RasterWindow,
} from '@/lib/sentinel2/rasterIndices'
import type { Sentinel2Data } from '@/lib/si/types'

const S2_COLLECTION = 'sentinel-2-l2a'
const MODIS_COLLECTION = 'modis-13Q1-061'
// STAC asset key mirrors the source HDF science-dataset name on MPC's
// MOD13Q1 collection (confirmed against Microsoft's PlanetaryComputerExamples
// notebooks and the MPC quickstart docs).
const MODIS_NDVI_ASSET = '250m_16_days_NDVI'
// Trail bbox has no size cap, so this matches the resolution the old CDSE
// Statistics API used (resx/resy=60) rather than a band's native 10/20m.
const S2_TARGET_RESOLUTION_M = 60
const MODIS_TARGET_RESOLUTION_M = 250 // MOD13Q1 native pixel size
const MAX_CLOUD_COVER = 60

const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SERIES_TTL_MS = 90 * 24 * 60 * 60 * 1000
const MAX_SAMPLE_POINTS = 20
const MAX_WATER_SOURCES = 10

function toStacBbox(bbox: GeoBbox): StacBbox {
  return [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat]
}

// Samples up to MAX_SAMPLE_POINTS points along the track, evenly spaced by
// distance (not array index) — these feed sampleAtPoint against the
// already-read snapshot window for landscapeVariety/waterSources below.
function sampleTrackPoints(track: [number, number][], maxPoints: number): [number, number][] {
  if (track.length <= maxPoints) return track
  let totalM = 0
  for (let i = 1; i < track.length; i++) totalM += haversineM(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1])
  const stepM = totalM / maxPoints

  const points: [number, number][] = [track[0]]
  let acc = 0
  for (let i = 1; i < track.length; i++) {
    acc += haversineM(track[i - 1][0], track[i - 1][1], track[i][0], track[i][1])
    if (acc >= stepM) { points.push(track[i]); acc = 0 }
  }
  return points.slice(0, maxPoints)
}

function monthWindow(month: number): { from: Date; to: Date } {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const year = month <= currentMonth ? now.getFullYear() : now.getFullYear() - 1
  const from = new Date(Date.UTC(year, month - 1, 1))
  const to = new Date(Date.UTC(year, month, 0))
  return { from, to }
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

interface TrailStatsRow { distanceKm: number | null; elevationGain: number | null; elevationLoss: number | null }

async function fetchTrailStats(osmRelationId: number): Promise<TrailStatsRow> {
  const { data } = await supabase
    .from('trails')
    .select('distance_km, elevation_gain, elevation_loss')
    .eq('osm_relation_id', osmRelationId)
    .maybeSingle()
  return { distanceKm: data?.distance_km ?? null, elevationGain: data?.elevation_gain ?? null, elevationLoss: data?.elevation_loss ?? null }
}

export interface S2CacheRow {
  ndviMonthly: number[] | null
  ndviDelta: number | null
  ndwiCurrent: number | null
  nbrCurrent: number | null
  eviCurrent: number | null
  bsiCurrent: number | null
  fireDetected: boolean
  floodDetected: boolean
  landslideRisk: boolean
  shadeScore: number | null
  landscapeVariety: number | null
  waterSources: Array<{ lat: number; lon: number }>
  phenologyPeakMonth: number | null
  computedAt: string | null
  available: boolean
}

export async function fetchS2Cache(osmRelationId: number): Promise<S2CacheRow | null> {
  const { data } = await supabase
    .from('trails')
    .select('s2_ndvi_monthly, s2_ndvi_delta, s2_ndwi_current, s2_nbr_current, s2_evi_current, s2_bsi_current, s2_fire_detected, s2_flood_detected, s2_landslide_risk, s2_shade_score, s2_landscape_variety, s2_water_sources, s2_phenology_peak_month, s2_computed_at, s2_available')
    .eq('osm_relation_id', osmRelationId)
    .maybeSingle()
  if (!data) return null
  return {
    ndviMonthly: data.s2_ndvi_monthly ?? null,
    ndviDelta: data.s2_ndvi_delta,
    ndwiCurrent: data.s2_ndwi_current,
    nbrCurrent: data.s2_nbr_current,
    eviCurrent: data.s2_evi_current,
    bsiCurrent: data.s2_bsi_current,
    fireDetected: data.s2_fire_detected ?? false,
    floodDetected: data.s2_flood_detected ?? false,
    landslideRisk: data.s2_landslide_risk ?? false,
    shadeScore: data.s2_shade_score,
    landscapeVariety: data.s2_landscape_variety,
    waterSources: data.s2_water_sources ?? [],
    phenologyPeakMonth: data.s2_phenology_peak_month,
    computedAt: data.s2_computed_at,
    available: data.s2_available ?? false,
  }
}

const UNAVAILABLE: Omit<Sentinel2Data, 'osmRelationId' | 'plannedHikeId'> = {
  available: false, ndviMonthly: null, ndviDelta: null, ndwiCurrent: null, nbrCurrent: null,
  eviCurrent: null, bsiCurrent: null, fireDetected: false, floodDetected: false, landslideRisk: false,
  shadeScore: null, landscapeVariety: null, waterSources: [], phenologyPeakMonth: null, computedAt: null,
}

interface SnapshotIndices {
  ndvi: number | null
  ndwi: number | null
  nbr: number | null
  evi: number | null
  bsi: number | null
  ndviWindow: RasterWindow | null
  ndwiWindow: RasterWindow | null
}

async function readSnapshotBand(item: StacItem, bandId: string, bbox: GeoBbox, resampleMethod: 'bilinear' | 'nearest' = 'bilinear') {
  const href = assetHref(item, bandId)
  if (!href) return null
  const sas = await getSasToken(href)
  const win = await readWindow(signAssetHref(href, sas), bbox, S2_TARGET_RESOLUTION_M, resampleMethod)
  return { win, bandScale: bandScaleFor(item, bandId) }
}

async function computeSnapshot(item: StacItem, bbox: GeoBbox): Promise<SnapshotIndices> {
  const [b02, b03, b04, b08, b11, b12, scl] = await Promise.all([
    readSnapshotBand(item, 'B02', bbox), readSnapshotBand(item, 'B03', bbox), readSnapshotBand(item, 'B04', bbox),
    readSnapshotBand(item, 'B08', bbox), readSnapshotBand(item, 'B11', bbox), readSnapshotBand(item, 'B12', bbox),
    readSnapshotBand(item, 'SCL', bbox, 'nearest'),
  ])
  if (!b02 || !b03 || !b04 || !b08 || !b11 || !b12 || !scl) {
    return { ndvi: null, ndwi: null, nbr: null, evi: null, bsi: null, ndviWindow: null, ndwiWindow: null }
  }

  const mask = maskFromScl(scl.win.data)
  const r02 = toReflectance(b02.win.data, b02.bandScale.scale, b02.bandScale.offset)
  const r03 = toReflectance(b03.win.data, b03.bandScale.scale, b03.bandScale.offset)
  const r04 = toReflectance(b04.win.data, b04.bandScale.scale, b04.bandScale.offset)
  const r08 = toReflectance(b08.win.data, b08.bandScale.scale, b08.bandScale.offset)
  const r11 = toReflectance(b11.win.data, b11.bandScale.scale, b11.bandScale.offset)
  const r12 = toReflectance(b12.win.data, b12.bandScale.scale, b12.bandScale.offset)

  const ndviArr = ndvi(r08, r04)
  const ndwiArr = ndwi(r03, r08)
  const { width, height } = b08.win

  return {
    ndvi: zonalMean(ndviArr, mask),
    ndwi: zonalMean(ndwiArr, mask),
    nbr: zonalMean(nbr(r08, r12), mask),
    evi: zonalMean(evi(r08, r04, r02), mask),
    bsi: zonalMean(bsi(r11, r04, r08, r02), mask),
    ndviWindow: { data: applyMask(ndviArr, mask), width, height, bbox },
    ndwiWindow: { data: applyMask(ndwiArr, mask), width, height, bbox },
  }
}

async function computeModisMonthNdvi(bbox: GeoBbox, month: number): Promise<number> {
  try {
    const { from, to } = monthWindow(month)
    const item = await searchStac(MODIS_COLLECTION, toStacBbox(bbox), from, to, { limit: 1 })
    if (!item) {
      console.error(`[sentinel2] MODIS NDVI month=${month}: no STAC item in window ${from.toISOString()}..${to.toISOString()}`)
      return 0
    }
    const href = assetHref(item, MODIS_NDVI_ASSET)
    if (!href) {
      console.error(`[sentinel2] MODIS NDVI month=${month}: item ${item.id} has no ${MODIS_NDVI_ASSET} asset`)
      return 0
    }
    const sas = await getSasToken(href)
    const win = await readModisWindow(signAssetHref(href, sas), bbox, MODIS_TARGET_RESOLUTION_M)
    return zonalMean(modisNdviToFraction(win.data)) ?? 0
  } catch (err) {
    console.error(`[sentinel2] MODIS NDVI month=${month} failed`, err)
    return 0
  }
}

type S2PipelineResult =
  | { status: 'cached'; row: S2CacheRow }
  | { status: 'computed'; row: S2CacheRow }
  | { status: 'unavailable'; reason: 'no_geometry' | 'no_data' | 'unreachable' | 'api_error'; debugInfo?: string }

// Pure pipeline shared by computeSentinel2 (OSM trail, `trails` cache) and
// computeSentinel2ForPlannedHike (arbitrary GPX track, `planned_hikes`
// cache) — works purely off trailPoints/bbox, no OSM linkage needed.
async function runSentinel2Pipeline(trailPoints: [number, number][], cache: S2CacheRow | null, stats: TrailStatsRow, force = false): Promise<S2PipelineResult> {
  if (trailPoints.length < 2) return { status: 'unavailable', reason: 'no_geometry' }

  try {
    const now = Date.now()
    const snapshotExpired = force || !cache?.computedAt || now - new Date(cache.computedAt).getTime() > SNAPSHOT_TTL_MS
    const seriesExpired = force || !cache?.computedAt || now - new Date(cache.computedAt).getTime() > SERIES_TTL_MS

    if (!snapshotExpired && cache) {
      return { status: 'cached', row: cache }
    }

    const [minLat, minLon, maxLat, maxLon] = computeBbox(trailPoints, 0.005).split(',').map(Number)
    const bbox: GeoBbox = { minLat, minLon, maxLat, maxLon }

    const snapshotEnd = new Date()
    const snapshotStart = new Date(snapshotEnd.getTime() - 10 * 24 * 60 * 60 * 1000)

    const currentItem = await searchStac(S2_COLLECTION, toStacBbox(bbox), snapshotStart, snapshotEnd, { maxCloudCover: MAX_CLOUD_COVER })
    if (!currentItem) return { status: 'unavailable', reason: 'no_data' }

    const [snapshot, monthsResult] = await Promise.all([
      computeSnapshot(currentItem, bbox),
      seriesExpired
        ? Promise.all(Array.from({ length: 12 }, (_, i) => i + 1).map(month => computeModisMonthNdvi(bbox, month)))
        : Promise.resolve(null),
    ])

    let ndviMonthly = cache?.ndviMonthly ?? null
    let phenologyPeakMonth = cache?.phenologyPeakMonth ?? null
    if (monthsResult) {
      ndviMonthly = monthsResult
      phenologyPeakMonth = monthsResult.reduce((best, v, i) => (v > monthsResult[best] ? i : best), 0) + 1
    }

    let landscapeVariety = cache?.landscapeVariety ?? null
    let waterSources = cache?.waterSources ?? []
    if (seriesExpired) {
      const samplePoints = sampleTrackPoints(trailPoints, MAX_SAMPLE_POINTS)

      const ndviSamples = samplePoints
        .map(([lat, lon]) => (snapshot.ndviWindow ? sampleAtPoint(snapshot.ndviWindow, lat, lon) : null))
        .filter((v): v is number => v != null)
      landscapeVariety = ndviSamples.length > 0 ? stdDev(ndviSamples) : null

      waterSources = samplePoints
        .map(([lat, lon]) => ({ lat, lon, ndwiVal: snapshot.ndwiWindow ? sampleAtPoint(snapshot.ndwiWindow, lat, lon) : null }))
        .filter((p): p is { lat: number; lon: number; ndwiVal: number } => p.ndwiVal != null && p.ndwiVal > 0.3)
        .slice(0, MAX_WATER_SOURCES)
        .map(({ lat, lon }) => ({ lat, lon }))
    }

    const ndviDelta = ndviMonthly && snapshot.ndvi != null
      ? snapshot.ndvi - ndviMonthly.reduce((s, v) => s + v, 0) / ndviMonthly.length
      : null

    const shadeScore = computeShadeScore(snapshot.evi, stats)

    const row: S2CacheRow = {
      ndviMonthly, ndviDelta,
      ndwiCurrent: snapshot.ndwi, nbrCurrent: snapshot.nbr, eviCurrent: snapshot.evi, bsiCurrent: snapshot.bsi,
      fireDetected: (snapshot.nbr ?? 0) < -0.05,
      floodDetected: (snapshot.ndwi ?? 0) > 0.2,
      landslideRisk: (snapshot.bsi ?? 0) > 0.3 && (snapshot.ndvi ?? 1) < 0.15,
      shadeScore, landscapeVariety, waterSources, phenologyPeakMonth,
      computedAt: new Date().toISOString(),
      available: true,
    }

    return { status: 'computed', row }
  } catch (err) {
    console.error('[sentinel2] Planetary Computer pipeline failed', err)
    return {
      status: 'unavailable',
      reason: err instanceof MpcUnreachableError ? 'unreachable' : 'api_error',
      debugInfo: err instanceof Error ? err.message : String(err),
    }
  }
}

function s2RowToUpdatePayload(row: S2CacheRow): Record<string, unknown> {
  return {
    s2_ndvi_monthly: row.ndviMonthly,
    s2_ndvi_delta: row.ndviDelta,
    s2_ndwi_current: row.ndwiCurrent,
    s2_nbr_current: row.nbrCurrent,
    s2_evi_current: row.eviCurrent,
    s2_bsi_current: row.bsiCurrent,
    s2_fire_detected: row.fireDetected,
    s2_flood_detected: row.floodDetected,
    s2_landslide_risk: row.landslideRisk,
    s2_shade_score: row.shadeScore,
    s2_landscape_variety: row.landscapeVariety,
    s2_water_sources: row.waterSources,
    s2_phenology_peak_month: row.phenologyPeakMonth,
    s2_computed_at: row.computedAt,
    s2_available: true,
  }
}

export async function computeSentinel2(osmRelationId: number, trailPoints: [number, number][], opts?: { force?: boolean }): Promise<Sentinel2Data> {
  const [cache, stats] = await Promise.all([fetchS2Cache(osmRelationId), fetchTrailStats(osmRelationId)])
  const result = await runSentinel2Pipeline(trailPoints, cache, stats, opts?.force)

  if (result.status === 'unavailable') {
    return { ...UNAVAILABLE, osmRelationId, reason: result.reason, debugInfo: result.debugInfo }
  }
  if (result.status === 'computed') {
    await supabase.from('trails').update(s2RowToUpdatePayload(result.row)).eq('osm_relation_id', osmRelationId)
  }
  return toSentinel2Data(result.row, { osmRelationId })
}

async function fetchS2CacheForPlannedHike(plannedHikeId: string): Promise<S2CacheRow | null> {
  const { data } = await supabase
    .from('planned_hikes')
    .select('s2_ndvi_monthly, s2_ndvi_delta, s2_ndwi_current, s2_nbr_current, s2_evi_current, s2_bsi_current, s2_fire_detected, s2_flood_detected, s2_landslide_risk, s2_shade_score, s2_landscape_variety, s2_water_sources, s2_phenology_peak_month, s2_computed_at, s2_available')
    .eq('id', plannedHikeId)
    .maybeSingle()
  if (!data) return null
  return {
    ndviMonthly: data.s2_ndvi_monthly ?? null,
    ndviDelta: data.s2_ndvi_delta,
    ndwiCurrent: data.s2_ndwi_current,
    nbrCurrent: data.s2_nbr_current,
    eviCurrent: data.s2_evi_current,
    bsiCurrent: data.s2_bsi_current,
    fireDetected: data.s2_fire_detected ?? false,
    floodDetected: data.s2_flood_detected ?? false,
    landslideRisk: data.s2_landslide_risk ?? false,
    shadeScore: data.s2_shade_score,
    landscapeVariety: data.s2_landscape_variety,
    waterSources: data.s2_water_sources ?? [],
    phenologyPeakMonth: data.s2_phenology_peak_month,
    computedAt: data.s2_computed_at,
    available: data.s2_available ?? false,
  }
}

// Standalone Sentinel-2 computation for a planned hike with no OSM
// correspondence — same pipeline as computeSentinel2, cached on the
// planned_hikes row itself (distanceKm/elevationGain/elevationLoss are
// already known from the hike, no `trails` lookup needed for shade score).
export async function computeSentinel2ForPlannedHike(
  plannedHikeId: string,
  trailPoints: [number, number][],
  distanceKm: number | null,
  elevationGain: number | null,
  elevationLoss: number | null,
  opts?: { force?: boolean },
): Promise<Sentinel2Data> {
  const cache = await fetchS2CacheForPlannedHike(plannedHikeId)
  const result = await runSentinel2Pipeline(trailPoints, cache, { distanceKm, elevationGain, elevationLoss }, opts?.force)

  if (result.status === 'unavailable') {
    return { ...UNAVAILABLE, plannedHikeId, reason: result.reason, debugInfo: result.debugInfo }
  }
  if (result.status === 'computed') {
    await supabase.from('planned_hikes').update(s2RowToUpdatePayload(result.row)).eq('id', plannedHikeId)
  }
  return toSentinel2Data(result.row, { plannedHikeId })
}

function computeShadeScore(evi: number | null, stats: TrailStatsRow): number | null {
  if (evi == null) return null
  let slopeNormalized = 0
  if (stats.distanceKm && stats.distanceKm > 0 && stats.elevationGain != null && stats.elevationLoss != null) {
    const slopePercent = ((stats.elevationGain + stats.elevationLoss) / (stats.distanceKm * 1000)) * 100
    slopeNormalized = Math.min(slopePercent / 50, 1) // 50%+ slope -> fully normalized
  }
  return Math.min(Math.max(evi * (1 - slopeNormalized), 0), 1)
}

export function toSentinel2Data(row: S2CacheRow, ref: { osmRelationId?: number; plannedHikeId?: string }): Sentinel2Data {
  return {
    ...ref,
    available: row.available,
    ndviMonthly: row.ndviMonthly,
    ndviDelta: row.ndviDelta,
    ndwiCurrent: row.ndwiCurrent,
    nbrCurrent: row.nbrCurrent,
    eviCurrent: row.eviCurrent,
    bsiCurrent: row.bsiCurrent,
    fireDetected: row.fireDetected,
    floodDetected: row.floodDetected,
    landslideRisk: row.landslideRisk,
    shadeScore: row.shadeScore,
    landscapeVariety: row.landscapeVariety,
    waterSources: row.waterSources,
    phenologyPeakMonth: row.phenologyPeakMonth,
    computedAt: row.computedAt,
  }
}
