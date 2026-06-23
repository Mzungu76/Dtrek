// Security Index orchestrator — resolves a trail's bbox/geometry, decides
// which of the 3 TTL buckets (static/dynamic/satellite) are due, runs only
// those collectors, merges them with whatever is still cached, and persists
// the result. See lib/si/types.ts for the data shapes and supabase-schema.sql
// for the `trails.si_*` columns this reads/writes.
import { supabase } from '@/lib/supabase'
import { computeBbox } from '@/lib/geoUtils'
import { fetchOverpass, stitchWays, type OsmRelation, type OsmWay } from '@/lib/overpassTrails'
import type {
  SIResult, SISignals, SILabel, SignalContext,
  OsmSignal, WeatherSignal, ClimateSignal, SatelliteSignal, ActivitySignal, CommunitySignal,
} from '@/lib/si/types'
import { fetchOsmTags, collectOsmSignal } from '@/lib/si/signals/osmSignals'
import { collectWeatherSignal } from '@/lib/si/signals/weatherSignals'
import { collectClimateSignal } from '@/lib/si/signals/climateSignals'
import { collectSatelliteSignal } from '@/lib/si/signals/satelliteSignals'
import { collectActivitySignal } from '@/lib/si/signals/activitySignals'
import { collectCommunitySignal } from '@/lib/si/signals/communitySignals'
import { findMatchingActivity } from '@/lib/si/matchTrail'

const STATIC_TTL_MS = 30 * 24 * 60 * 60 * 1000
const DYNAMIC_TTL_MS = 1 * 24 * 60 * 60 * 1000
const SATELLITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const COLLECTOR_TIMEOUT_MS = 5000

const NEUTRAL_OSM: OsmSignal = { accessPenalty: 0, visibilityPenalty: 0, freshnessScore: 0, operatorBonus: 0, lastModified: null }
const NEUTRAL_WEATHER: WeatherSignal = { precipPenalty: 0, soilPenalty: 0, surfaceMultiplier: 1.2, slopeMultiplier: 1.0, totalPenalty: 0 }
const NEUTRAL_CLIMATE: ClimateSignal = { tempPenalty: 0, altitudeSeason: 0, seasonBonus: 0 }
const NEUTRAL_SATELLITE: SatelliteSignal = { available: false, ndviDeltaPenalty: 0, ndviAbsolutePenalty: 0, firePenalty: 0, floodPenalty: 0, landslidePenalty: 0 }
const NEUTRAL_ACTIVITY: ActivitySignal = { dtrekBonus: 0, heatmapPenalty: -10 }
const NEUTRAL_COMMUNITY: CommunitySignal = { osmNotesPenalty: 0, osmNotesDetails: [], dtrekReviewsScore: 0 }

interface TrailSiRow {
  bbox: SignalContext['bbox'] | null
  geometrySimplified: [number, number][] | null
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  siScore: number | null
  siSignals: SISignals | null
  siStaticComputedAt: string | null
  siDynamicComputedAt: string | null
  siSatelliteComputedAt: string | null
  isGhostTrail: boolean
}

async function fetchTrailSiRow(osmRelationId: number): Promise<TrailSiRow | null> {
  const { data } = await supabase
    .from('trails')
    .select('bbox, geometry_simplified, distance_km, elevation_gain, elevation_loss, si_score, si_signals, si_static_computed_at, si_dynamic_computed_at, si_satellite_computed_at, is_ghost_trail')
    .eq('osm_relation_id', osmRelationId)
    .maybeSingle()
  if (!data) return null
  return {
    bbox: data.bbox,
    geometrySimplified: data.geometry_simplified ?? null,
    distanceKm: data.distance_km,
    elevationGain: data.elevation_gain,
    elevationLoss: data.elevation_loss,
    siScore: data.si_score,
    siSignals: data.si_signals,
    siStaticComputedAt: data.si_static_computed_at,
    siDynamicComputedAt: data.si_dynamic_computed_at,
    siSatelliteComputedAt: data.si_satellite_computed_at,
    isGhostTrail: data.is_ghost_trail ?? false,
  }
}

interface OverpassGeometryResponse {
  elements: Array<OsmRelation | OsmWay>
}

// Only used when a trail has no `trails` cache row yet — fetches bbox/geometry
// for this single computeSI call without writing anything back, so this path
// never competes with app/api/waymarked-trails/details/route.ts's own writer
// for the same row's data_quality.
async function resolveGeometryFallback(osmRelationId: number): Promise<{ bbox: SignalContext['bbox']; geometry: [number, number][] } | null> {
  try {
    const query = `[out:json][timeout:20];relation(${osmRelationId})->.rel;.rel out body;way(r.rel);out geom;`
    const data = await fetchOverpass<OverpassGeometryResponse>(query, 15_000)
    const relation = data.elements.find((e): e is OsmRelation => e.type === 'relation')
    if (!relation?.members) return null

    const wayMap = new Map<number, OsmWay>()
    for (const el of data.elements) if (el.type === 'way') wayMap.set(el.id, el)

    const geometry = stitchWays(relation.members, wayMap)
    if (geometry.length < 2) return null

    const [minLat, minLon, maxLat, maxLon] = computeBbox(geometry, 0.005).split(',').map(Number)
    return { geometry, bbox: { minLat, minLon, maxLat, maxLon } }
  } catch {
    return null
  }
}

// Shared with app/api/trails/sentinel2/route.ts so it never duplicates the
// cached-row-or-Overpass-fallback geometry resolution computeSI already does.
export async function resolveTrailGeometry(osmRelationId: number): Promise<[number, number][] | null> {
  const row = await fetchTrailSiRow(osmRelationId)
  if (row?.geometrySimplified && row.geometrySimplified.length >= 2) return row.geometrySimplified
  const fallback = await resolveGeometryFallback(osmRelationId)
  return fallback?.geometry ?? null
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('collector timeout')), ms)),
  ])
}

function labelFor(score: number): SILabel {
  if (score >= 80) return { text: 'Percorribile', color: 'green', tailwind: 'bg-forest-700' }
  if (score >= 60) return { text: 'Probabilmente ok', color: 'lime', tailwind: 'bg-lime-600' }
  if (score >= 40) return { text: 'Verificare prima', color: 'amber', tailwind: 'bg-amber-500' }
  if (score >= 20) return { text: 'Attenzione', color: 'red', tailwind: 'bg-red-600' }
  return { text: 'Sconsigliato', color: 'black', tailwind: 'bg-gray-800' }
}

function computeScore(s: SISignals): number {
  let score = 100
  score += s.osm.accessPenalty + s.osm.visibilityPenalty + s.osm.freshnessScore + s.osm.operatorBonus
  score += clamp(s.weather.totalPenalty, -35, 0)
  score += s.climate.tempPenalty + s.climate.altitudeSeason + s.climate.seasonBonus
  score += s.satellite.ndviDeltaPenalty + s.satellite.ndviAbsolutePenalty + s.satellite.firePenalty + s.satellite.floodPenalty + s.satellite.landslidePenalty
  score += s.activity.heatmapPenalty + s.activity.dtrekBonus
  score += s.community.osmNotesPenalty + s.community.dtrekReviewsScore
  return clamp(score, 0, 100)
}

function dominantWarningFor(s: SISignals): string | null {
  const candidates: Array<{ value: number; text: string }> = []

  if (s.osm.accessPenalty < 0) {
    candidates.push({ value: s.osm.accessPenalty, text: s.osm.accessPenalty <= -60 ? 'Accesso al sentiero segnalato come vietato su OSM' : 'Accesso al sentiero segnalato come privato su OSM' })
  }
  if (s.osm.visibilityPenalty < 0) {
    candidates.push({ value: s.osm.visibilityPenalty, text: 'Scarsa visibilità del sentiero segnalata su OSM' })
  }
  if (s.osm.freshnessScore < 0) {
    const months = s.osm.lastModified ? Math.round((Date.now() - new Date(s.osm.lastModified).getTime()) / (1000 * 60 * 60 * 24 * 30)) : null
    candidates.push({ value: s.osm.freshnessScore, text: months ? `Dati OSM non aggiornati da circa ${months} mesi` : 'Dati OSM non aggiornati da molto tempo' })
  }
  if (s.weather.totalPenalty < 0) {
    candidates.push({ value: s.weather.totalPenalty, text: 'Precipitazioni e umidità del suolo elevate negli ultimi 7 giorni' })
  }
  if (s.climate.tempPenalty < 0) {
    candidates.push({ value: s.climate.tempPenalty, text: 'Temperature attuali sfavorevoli per questo sentiero' })
  }
  if (s.climate.altitudeSeason < 0) {
    candidates.push({ value: s.climate.altitudeSeason, text: 'Quota elevata in stagione invernale' })
  }
  if (s.satellite.firePenalty < 0) {
    candidates.push({ value: s.satellite.firePenalty, text: 'Possibile area incendiata rilevata via satellite' })
  }
  if (s.satellite.floodPenalty < 0) {
    candidates.push({ value: s.satellite.floodPenalty, text: 'Possibile area alluvionata rilevata via satellite' })
  }
  if (s.satellite.landslidePenalty < 0) {
    candidates.push({ value: s.satellite.landslidePenalty, text: 'Possibile rischio frana rilevato via satellite' })
  }
  if (s.satellite.ndviDeltaPenalty < 0) {
    candidates.push({ value: s.satellite.ndviDeltaPenalty, text: 'Variazione anomala della vegetazione rilevata via satellite' })
  }
  if (s.satellite.ndviAbsolutePenalty < 0) {
    candidates.push({ value: s.satellite.ndviAbsolutePenalty, text: 'Vegetazione molto fitta che potrebbe rendere il sentiero poco percorribile' })
  }
  if (s.activity.heatmapPenalty < 0) {
    candidates.push({ value: s.activity.heatmapPenalty, text: 'Scarso utilizzo recente rilevato' })
  }
  if (s.community.osmNotesPenalty < 0) {
    const closest = [...s.community.osmNotesDetails].sort((a, b) => a.distanceM - b.distanceM)[0]
    candidates.push({
      value: s.community.osmNotesPenalty,
      text: closest ? `Segnalazione recente della comunità OSM a ${closest.distanceM}m` : 'Segnalazioni recenti della comunità OSM nelle vicinanze',
    })
  }
  if (s.community.dtrekReviewsScore < 0) {
    candidates.push({ value: s.community.dtrekReviewsScore, text: 'Recensioni recenti DTrek negative per questo sentiero' })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.value - b.value)
  return candidates[0].text
}

interface SiCacheFields {
  siScore: number | null
  siSignals: SISignals | null
  siStaticComputedAt: string | null
  siDynamicComputedAt: string | null
  siSatelliteComputedAt: string | null
  isGhostTrail: boolean
}

interface SiPipelineResult {
  signals: SISignals
  score: number
  label: SILabel
  dominantWarning: string | null
  isGhostTrail: boolean
  partial: boolean
  staticExpired: boolean
  dynamicExpired: boolean
  satelliteExpired: boolean
}

// Pure scoring pipeline shared by computeSI (OSM trail, `trails` cache) and
// computeSIForPlannedHike (arbitrary GPX track, `planned_hikes` cache) — no
// I/O besides the collectors themselves. `overpassRelationId` is the only
// thing genuinely tied to OSM (relation tags via Overpass): pass null for a
// track with no OSM correspondence and every collector below degrades to
// its already-existing neutral fallback (same as when Overpass itself is
// unreachable), since none of them otherwise use the id parameter.
async function runSiPipeline(
  geometry: [number, number][],
  bbox: SignalContext['bbox'],
  distanceKm: number | null,
  elevationGain: number | null,
  elevationLoss: number | null,
  cached: SiCacheFields,
  overpassRelationId: number | null,
): Promise<SiPipelineResult> {
  const now = Date.now()
  const staticExpired = !cached.siStaticComputedAt || now - new Date(cached.siStaticComputedAt).getTime() > STATIC_TTL_MS
  const dynamicExpired = !cached.siDynamicComputedAt || now - new Date(cached.siDynamicComputedAt).getTime() > DYNAMIC_TTL_MS
  const satelliteExpired = !cached.siSatelliteComputedAt || now - new Date(cached.siSatelliteComputedAt).getTime() > SATELLITE_TTL_MS

  const needsOsmTags = staticExpired || dynamicExpired // weather (dynamic) reads ctx.osmTags.surface
  const needsMatch = dynamicExpired // activity (dynamic) reads ctx.matchedActivity

  const [tagsResult, matchResult] = await Promise.all([
    needsOsmTags && overpassRelationId != null ? fetchOsmTags(overpassRelationId) : Promise.resolve({ tags: {}, lastModified: null }),
    needsMatch ? findMatchingActivity(geometry, bbox).catch(() => null) : Promise.resolve(null),
  ])

  const ctx: SignalContext = {
    bbox,
    geometry,
    centroid: { lat: (bbox.minLat + bbox.maxLat) / 2, lon: (bbox.minLon + bbox.maxLon) / 2 },
    distanceKm,
    elevationGain,
    elevationLoss,
    osmTags: tagsResult.tags,
    osmLastModified: tagsResult.lastModified,
    matchedActivity: matchResult,
  }

  // None of the collectors below actually use this id (it's vestigial in
  // their signatures, kept for symmetry) — a placeholder is fine when there
  // is no real OSM relation.
  const collectorId = overpassRelationId ?? 0

  type CollectorKey = 'osm' | 'weather' | 'climate' | 'satellite' | 'activity' | 'community'
  const tasks: Array<{ key: CollectorKey; promise: Promise<unknown>; neutral: unknown }> = []
  if (staticExpired) tasks.push({ key: 'osm', promise: collectOsmSignal(collectorId, ctx), neutral: NEUTRAL_OSM })
  if (dynamicExpired) {
    tasks.push({ key: 'weather', promise: collectWeatherSignal(collectorId, ctx), neutral: NEUTRAL_WEATHER })
    tasks.push({ key: 'climate', promise: collectClimateSignal(collectorId, ctx), neutral: NEUTRAL_CLIMATE })
    tasks.push({ key: 'activity', promise: collectActivitySignal(collectorId, ctx), neutral: NEUTRAL_ACTIVITY })
    tasks.push({ key: 'community', promise: collectCommunitySignal(collectorId, ctx), neutral: NEUTRAL_COMMUNITY })
  }
  if (satelliteExpired) tasks.push({ key: 'satellite', promise: collectSatelliteSignal(collectorId, ctx), neutral: NEUTRAL_SATELLITE })

  const settled = await Promise.allSettled(tasks.map(t => withTimeout(t.promise, COLLECTOR_TIMEOUT_MS)))

  let partial = false
  const fresh: Partial<Record<CollectorKey, unknown>> = {}
  settled.forEach((result, i) => {
    const { key, neutral } = tasks[i]
    if (result.status === 'fulfilled') fresh[key] = result.value
    else { fresh[key] = neutral; partial = true }
  })

  const cachedSignals = cached.siSignals
  const signals: SISignals = {
    osm:       (fresh.osm as OsmSignal) ?? cachedSignals?.osm ?? NEUTRAL_OSM,
    weather:   (fresh.weather as WeatherSignal) ?? cachedSignals?.weather ?? NEUTRAL_WEATHER,
    climate:   (fresh.climate as ClimateSignal) ?? cachedSignals?.climate ?? NEUTRAL_CLIMATE,
    satellite: (fresh.satellite as SatelliteSignal) ?? cachedSignals?.satellite ?? NEUTRAL_SATELLITE,
    activity:  (fresh.activity as ActivitySignal) ?? cachedSignals?.activity ?? NEUTRAL_ACTIVITY,
    community: (fresh.community as CommunitySignal) ?? cachedSignals?.community ?? NEUTRAL_COMMUNITY,
  }

  // Ghost trail can only be newly *set* on the very first computation ever
  // (si_score still null going in); afterwards it's sticky and can only be
  // *cleared* once a DTrek activity/planned-hike match is found.
  let isGhostTrail = cached.isGhostTrail
  if (dynamicExpired) {
    if (ctx.matchedActivity) {
      isGhostTrail = false
    } else if (cached.siScore == null && signals.osm.freshnessScore === -30) {
      isGhostTrail = true
    }
  }

  const score = computeScore(signals)
  const label = labelFor(score)
  const dominantWarning = dominantWarningFor(signals)

  return { signals, score, label, dominantWarning, isGhostTrail, partial, staticExpired, dynamicExpired, satelliteExpired }
}

export async function computeSI(
  osmRelationId: number,
  precomputedGeometry?: { bbox: SignalContext['bbox']; geometrySimplified: [number, number][] },
): Promise<SIResult> {
  const trailRow = await fetchTrailSiRow(osmRelationId)

  let bbox: SignalContext['bbox']
  let geometry: [number, number][]
  if (precomputedGeometry) {
    bbox = precomputedGeometry.bbox
    geometry = precomputedGeometry.geometrySimplified
  } else if (trailRow?.bbox && trailRow.geometrySimplified && trailRow.geometrySimplified.length >= 2) {
    bbox = trailRow.bbox
    geometry = trailRow.geometrySimplified
  } else {
    const fallback = await resolveGeometryFallback(osmRelationId)
    if (!fallback) throw new Error('Sentiero non risolvibile')
    bbox = fallback.bbox
    geometry = fallback.geometry
  }

  const cached: SiCacheFields = {
    siScore: trailRow?.siScore ?? null,
    siSignals: trailRow?.siSignals ?? null,
    siStaticComputedAt: trailRow?.siStaticComputedAt ?? null,
    siDynamicComputedAt: trailRow?.siDynamicComputedAt ?? null,
    siSatelliteComputedAt: trailRow?.siSatelliteComputedAt ?? null,
    isGhostTrail: trailRow?.isGhostTrail ?? false,
  }

  const result = await runSiPipeline(
    geometry, bbox,
    trailRow?.distanceKm ?? null, trailRow?.elevationGain ?? null, trailRow?.elevationLoss ?? null,
    cached, osmRelationId,
  )

  const cachedAt = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    si_score: result.score,
    si_label: result.label.text,
    si_signals: result.signals,
    si_computed_at: cachedAt,
    dominant_warning: result.dominantWarning,
    is_ghost_trail: result.isGhostTrail,
  }
  if (result.staticExpired) updatePayload.si_static_computed_at = cachedAt
  if (result.dynamicExpired) updatePayload.si_dynamic_computed_at = cachedAt
  if (result.satelliteExpired) updatePayload.si_satellite_computed_at = cachedAt

  await supabase.from('trails').update(updatePayload).eq('osm_relation_id', osmRelationId)

  return {
    osmRelationId, si: result.score, label: result.label, isGhostTrail: result.isGhostTrail,
    dominantWarning: result.dominantWarning, signals: result.signals, partial: result.partial, cachedAt,
  }
}

async function fetchPlannedSiCache(plannedHikeId: string): Promise<SiCacheFields> {
  const { data } = await supabase
    .from('planned_hikes')
    .select('si_score, si_signals, si_static_computed_at, si_dynamic_computed_at, si_satellite_computed_at, is_ghost_trail')
    .eq('id', plannedHikeId)
    .maybeSingle()
  return {
    siScore: data?.si_score ?? null,
    siSignals: data?.si_signals ?? null,
    siStaticComputedAt: data?.si_static_computed_at ?? null,
    siDynamicComputedAt: data?.si_dynamic_computed_at ?? null,
    siSatelliteComputedAt: data?.si_satellite_computed_at ?? null,
    isGhostTrail: data?.is_ghost_trail ?? false,
  }
}

// Standalone SI computation for a planned hike with no OSM correspondence
// (e.g. an imported GPX track that doesn't match any cached `trails` row).
// Same scoring pipeline as computeSI, but cached on the planned_hikes row
// itself instead of the shared `trails` cache — see
// supabase/migrations/add_planned_hikes_si_sentinel2_columns.sql.
export async function computeSIForPlannedHike(
  plannedHikeId: string,
  geometry: [number, number][],
  bbox: SignalContext['bbox'],
  distanceKm: number | null,
  elevationGain: number | null,
  elevationLoss: number | null,
): Promise<SIResult> {
  const cached = await fetchPlannedSiCache(plannedHikeId)

  const result = await runSiPipeline(geometry, bbox, distanceKm, elevationGain, elevationLoss, cached, null)

  const cachedAt = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    si_score: result.score,
    si_label: result.label.text,
    si_signals: result.signals,
    si_computed_at: cachedAt,
    dominant_warning: result.dominantWarning,
    is_ghost_trail: result.isGhostTrail,
  }
  if (result.staticExpired) updatePayload.si_static_computed_at = cachedAt
  if (result.dynamicExpired) updatePayload.si_dynamic_computed_at = cachedAt
  if (result.satelliteExpired) updatePayload.si_satellite_computed_at = cachedAt

  await supabase.from('planned_hikes').update(updatePayload).eq('id', plannedHikeId)

  return {
    plannedHikeId, si: result.score, label: result.label, isGhostTrail: result.isGhostTrail,
    dominantWarning: result.dominantWarning, signals: result.signals, partial: result.partial, cachedAt,
  }
}
