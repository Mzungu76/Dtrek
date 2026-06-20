// Sentinel-2 enrichment — phenology (monthly NDVI), landscape variety, shade
// estimate, water sources, and hazard flags for the trail detail panel.
// One-way dependency on lib/si: reuses getCdseToken() from satelliteSignals.ts
// (same CDSE OAuth client) so the SI satellite collector and this module never
// authenticate twice — nothing in lib/si imports from here.
import { supabase } from '@/lib/supabase'
import { haversineM, computeBbox } from '@/lib/geoUtils'
import { getCdseToken } from '@/lib/si/signals/satelliteSignals'
import type { Sentinel2Data } from '@/lib/si/types'

const STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics'
const TIMEOUT_MS = 8000
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SERIES_TTL_MS = 90 * 24 * 60 * 60 * 1000
const MAX_SAMPLE_POINTS = 20
const MAX_WATER_SOURCES = 10

type Bbox = { minLat: number; maxLat: number; minLon: number; maxLon: number }

const SNAPSHOT_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B02","B03","B04","B08","B11","B12","dataMask"],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndwi", bands: 1, sampleType: "FLOAT32" },
      { id: "nbr", bands: 1, sampleType: "FLOAT32" },
      { id: "evi", bands: 1, sampleType: "FLOAT32" },
      { id: "bsi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 },
    ],
  }
}
function evaluatePixel(s) {
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04)
  const ndwi = (s.B03 - s.B08) / (s.B03 + s.B08)
  const nbr  = (s.B08 - s.B12) / (s.B08 + s.B12)
  const evi  = 2.5 * (s.B08 - s.B04) / (s.B08 + 6 * s.B04 - 7.5 * s.B02 + 1)
  const bsi  = ((s.B11 + s.B04) - (s.B08 + s.B02)) / ((s.B11 + s.B04) + (s.B08 + s.B02))
  return { ndvi: [ndvi], ndwi: [ndwi], nbr: [nbr], evi: [evi], bsi: [bsi], dataMask: [s.dataMask] }
}`

const POINT_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: ["B03","B04","B08","dataMask"], output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }, { id: "ndwi", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }] }
}
function evaluatePixel(s) {
  return { ndvi: [(s.B08 - s.B04) / (s.B08 + s.B04)], ndwi: [(s.B03 - s.B08) / (s.B03 + s.B08)], dataMask: [s.dataMask] }
}`

const NDVI_ONLY_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: ["B04","B08","dataMask"], output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }] }
}
function evaluatePixel(s) {
  return { ndvi: [(s.B08 - s.B04) / (s.B08 + s.B04)], dataMask: [s.dataMask] }
}`

async function runStatistics(
  token: string,
  bbox: Bbox,
  evalscript: string,
  from: Date,
  to: Date,
  outputIds: string[],
): Promise<Record<string, number | null>> {
  const body = {
    input: {
      bounds: { bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat], properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
      data: [{ type: 'sentinel-2-l2a' }],
    },
    aggregation: {
      timeRange: { from: from.toISOString(), to: to.toISOString() },
      aggregationInterval: { of: 'P370D' },
      evalscript,
      resx: 10,
      resy: 10,
    },
    calculations: Object.fromEntries(outputIds.map(id => [id, { statistics: { default: {} } }])),
  }
  const res = await fetch(STATISTICS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`CDSE statistics error ${res.status}`)
  const d = await res.json()
  const bucket = d.data?.[0]?.outputs
  const out: Record<string, number | null> = {}
  for (const id of outputIds) out[id] = bucket?.[id]?.bands?.B0?.stats?.mean ?? null
  return out
}

function pointBbox(lat: number, lon: number, radiusM = 30): Bbox {
  const dLat = radiusM / 111_320
  const dLon = radiusM / (111_320 * Math.cos(lat * Math.PI / 180))
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon }
}

// Samples up to MAX_SAMPLE_POINTS points along the track, evenly spaced by
// distance (not array index) — there's no raster-decoding dependency in this
// codebase, so each "pixel" is approximated by a small bbox mean via the
// Statistics API rather than true per-pixel extraction from a Process API image.
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

const UNAVAILABLE: Sentinel2Data = {
  osmRelationId: 0, available: false, ndviMonthly: null, ndviDelta: null, ndwiCurrent: null, nbrCurrent: null,
  eviCurrent: null, bsiCurrent: null, fireDetected: false, floodDetected: false, landslideRisk: false,
  shadeScore: null, landscapeVariety: null, waterSources: [], phenologyPeakMonth: null, computedAt: null,
}

export async function computeSentinel2(osmRelationId: number, trailPoints: [number, number][]): Promise<Sentinel2Data> {
  let token: string | null
  try {
    token = await getCdseToken()
  } catch (err) {
    console.error('[sentinel2] CDSE auth failed', err)
    return { ...UNAVAILABLE, osmRelationId, reason: 'auth_failed' }
  }
  if (!token) return { ...UNAVAILABLE, osmRelationId, reason: 'missing_credentials' }
  if (trailPoints.length < 2) return { ...UNAVAILABLE, osmRelationId, reason: 'no_geometry' }

  try {
    const cache = await fetchS2Cache(osmRelationId)
    const now = Date.now()
    const snapshotExpired = !cache?.computedAt || now - new Date(cache.computedAt).getTime() > SNAPSHOT_TTL_MS
    const seriesExpired = !cache?.computedAt || now - new Date(cache.computedAt).getTime() > SERIES_TTL_MS

    if (!snapshotExpired && cache) {
      return toSentinel2Data(osmRelationId, cache)
    }

    const [minLat, minLon, maxLat, maxLon] = computeBbox(trailPoints, 0.005).split(',').map(Number)
    const bbox: Bbox = { minLat, minLon, maxLat, maxLon }

    const snapshotEnd = new Date()
    const snapshotStart = new Date(snapshotEnd.getTime() - 10 * 24 * 60 * 60 * 1000)
    const snapshot = await runStatistics(token, bbox, SNAPSHOT_EVALSCRIPT, snapshotStart, snapshotEnd, ['ndvi', 'ndwi', 'nbr', 'evi', 'bsi'])

    let ndviMonthly = cache?.ndviMonthly ?? null
    let landscapeVariety = cache?.landscapeVariety ?? null
    let waterSources = cache?.waterSources ?? []
    let phenologyPeakMonth = cache?.phenologyPeakMonth ?? null

    if (seriesExpired) {
      const months = await Promise.all(
        Array.from({ length: 12 }, (_, i) => i + 1).map(async month => {
          try {
            const { from, to } = monthWindow(month)
            const r = await runStatistics(token, bbox, NDVI_ONLY_EVALSCRIPT, from, to, ['ndvi'])
            return r.ndvi ?? 0
          } catch {
            return 0
          }
        }),
      )
      ndviMonthly = months
      phenologyPeakMonth = months.reduce((best, v, i) => (v > months[best] ? i : best), 0) + 1

      const samplePoints = sampleTrackPoints(trailPoints, MAX_SAMPLE_POINTS)
      const pointStats = await Promise.all(
        samplePoints.map(async ([lat, lon]) => {
          try {
            return await runStatistics(token, pointBbox(lat, lon), POINT_EVALSCRIPT, snapshotStart, snapshotEnd, ['ndvi', 'ndwi'])
          } catch {
            return null
          }
        }),
      )
      const ndviSamples = pointStats.map(p => p?.ndvi).filter((v): v is number => v != null)
      landscapeVariety = ndviSamples.length > 0 ? stdDev(ndviSamples) : null

      waterSources = samplePoints
        .map((pt, i) => ({ pt, ndwi: pointStats[i]?.ndwi ?? null }))
        .filter(({ ndwi }) => ndwi != null && ndwi > 0.3)
        .slice(0, MAX_WATER_SOURCES)
        .map(({ pt }) => ({ lat: pt[0], lon: pt[1] }))
    }

    const ndviDelta = ndviMonthly && snapshot.ndvi != null
      ? snapshot.ndvi - ndviMonthly.reduce((s, v) => s + v, 0) / ndviMonthly.length
      : null

    const stats = await fetchTrailStats(osmRelationId)
    const shadeScore = computeShadeScore(snapshot.evi, stats)

    const result: S2CacheRow = {
      ndviMonthly, ndviDelta,
      ndwiCurrent: snapshot.ndwi, nbrCurrent: snapshot.nbr, eviCurrent: snapshot.evi, bsiCurrent: snapshot.bsi,
      fireDetected: (snapshot.nbr ?? 0) < -0.05,
      floodDetected: (snapshot.ndwi ?? 0) > 0.2,
      landslideRisk: (snapshot.bsi ?? 0) > 0.3 && (snapshot.ndvi ?? 1) < 0.15,
      shadeScore, landscapeVariety, waterSources, phenologyPeakMonth,
      computedAt: new Date().toISOString(),
      available: true,
    }

    await supabase.from('trails').update({
      s2_ndvi_monthly: result.ndviMonthly,
      s2_ndvi_delta: result.ndviDelta,
      s2_ndwi_current: result.ndwiCurrent,
      s2_nbr_current: result.nbrCurrent,
      s2_evi_current: result.eviCurrent,
      s2_bsi_current: result.bsiCurrent,
      s2_fire_detected: result.fireDetected,
      s2_flood_detected: result.floodDetected,
      s2_landslide_risk: result.landslideRisk,
      s2_shade_score: result.shadeScore,
      s2_landscape_variety: result.landscapeVariety,
      s2_water_sources: result.waterSources,
      s2_phenology_peak_month: result.phenologyPeakMonth,
      s2_computed_at: result.computedAt,
      s2_available: true,
    }).eq('osm_relation_id', osmRelationId)

    return toSentinel2Data(osmRelationId, result)
  } catch (err) {
    console.error('[sentinel2] CDSE statistics failed', err)
    return { ...UNAVAILABLE, osmRelationId, reason: 'api_error' }
  }
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

export function toSentinel2Data(osmRelationId: number, row: S2CacheRow): Sentinel2Data {
  return {
    osmRelationId,
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
