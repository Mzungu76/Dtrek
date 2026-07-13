// Confidence Level orchestrator — resolves a trail's bbox/geometry, decides
// which of the 3 TTL buckets (static/dynamic/satellite) are due, runs only
// those collectors, merges them with whatever is still cached, and persists
// the result. See lib/cl/types.ts for the data shapes and supabase-schema.sql
// for the `trails.si_*` columns this reads/writes.
import { supabase } from '@/lib/supabase'
import { computeBbox } from '@/lib/geoUtils'
import { fetchOverpass, stitchWays, type OsmRelation, type OsmWay } from '@/lib/overpassTrails'
import type {
  CLResult, CLSignals, CLLabel, SignalContext,
  OsmSignal, WeatherSignal, ClimateSignal, SatelliteSignal, ActivitySignal, CommunitySignal,
} from '@/lib/cl/types'
import { fetchOsmTags, collectOsmSignal } from '@/lib/cl/signals/osmSignals'
import { collectWeatherSignal } from '@/lib/cl/signals/weatherSignals'
import { collectClimateSignal } from '@/lib/cl/signals/climateSignals'
import { collectSatelliteSignal } from '@/lib/cl/signals/satelliteSignals'
import { collectActivitySignal } from '@/lib/cl/signals/activitySignals'
import { collectCommunitySignal } from '@/lib/cl/signals/communitySignals'
import { findMatchingActivity } from '@/lib/cl/matchTrail'
import { SI_STATIC_TTL_MS, SI_DYNAMIC_TTL_MS, SI_SATELLITE_TTL_MS, labelForSiScore } from '@/lib/cl/label'

const STATIC_TTL_MS = SI_STATIC_TTL_MS
const DYNAMIC_TTL_MS = SI_DYNAMIC_TTL_MS
const SATELLITE_TTL_MS = SI_SATELLITE_TTL_MS
const COLLECTOR_TIMEOUT_MS = 5000
const FORCE_REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000

// Thrown by computeCL/computeCLForPlannedHike when a manual `force` refresh
// is requested before the previous one's 24h cooldown has elapsed — caught
// by app/api/trails/cl/route.ts to reply 429 instead of re-hitting every
// external API on every click of the "Aggiorna CL" button.
export class CLRateLimitError extends Error {
  constructor(public availableAt: string) {
    super('SI refresh rate limited')
  }
}

const NEUTRAL_OSM: OsmSignal = { accessPenalty: 0, visibilityPenalty: 0, freshnessScore: 0, operatorBonus: 0, lastModified: null }
const NEUTRAL_WEATHER: WeatherSignal = { precipPenalty: 0, soilPenalty: 0, surfaceMultiplier: 1.2, slopeMultiplier: 1.0, totalPenalty: 0 }
const NEUTRAL_CLIMATE: ClimateSignal = { tempPenalty: 0, altitudeSeason: 0, seasonBonus: 0 }
const NEUTRAL_SATELLITE: SatelliteSignal = { available: false, ndviDeltaPenalty: 0, ndviAbsolutePenalty: 0, firePenalty: 0, floodPenalty: 0, landslidePenalty: 0, landslideSource: 'none', floodSource: 'none', rockfallPenalty: 0, rockfallSource: 'none' }
const NEUTRAL_ACTIVITY: ActivitySignal = { dtrekBonus: 0 }
const NEUTRAL_COMMUNITY: CommunitySignal = { osmNotesPenalty: 0, osmNotesDetails: [], difficultyMarkersPenalty: 0, difficultyMarkersDetails: [] }

interface TrailSiRow {
  bbox: SignalContext['bbox'] | null
  geometrySimplified: [number, number][] | null
  distanceKm: number | null
  elevationGain: number | null
  elevationLoss: number | null
  siScore: number | null
  siSignals: CLSignals | null
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
// for this single computeCL call without writing anything back, so this path
// never competes with app/api/waymarked-trails/details/route.ts's own writer
// for the same row's data_quality.
export async function resolveGeometryFallback(osmRelationId: number): Promise<{ bbox: SignalContext['bbox']; geometry: [number, number][] } | null> {
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
// cached-row-or-Overpass-fallback geometry resolution computeCL already does.
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

function computeScore(s: CLSignals): number {
  // Only a subset of the still-computed-and-persisted signals feed the CL
  // score. Excluded (calculated + stored in si_signals, but not summed here):
  // osm.visibilityPenalty, all weather.*, all climate.*,
  // satellite.ndviAbsolutePenalty, satellite.rockfallPenalty.
  const sum =
    s.osm.accessPenalty +
    s.osm.freshnessScore +
    s.osm.operatorBonus +
    s.satellite.ndviDeltaPenalty +
    s.satellite.firePenalty +
    s.satellite.floodPenalty +
    s.satellite.landslidePenalty +
    s.activity.dtrekBonus +
    s.community.osmNotesPenalty +
    s.community.difficultyMarkersPenalty
  return clamp(100 + sum, 0, 100)
}

function dominantWarningFor(s: CLSignals): string | null {
  const candidates: Array<{ value: number; text: string }> = []

  if (s.osm.accessPenalty < 0) {
    candidates.push({ value: s.osm.accessPenalty, text: s.osm.accessPenalty <= -60 ? 'Accesso al sentiero segnalato come vietato su OSM' : 'Accesso al sentiero segnalato come privato su OSM' })
  }
  if (s.osm.freshnessScore < 0) {
    const months = s.osm.lastModified ? Math.round((Date.now() - new Date(s.osm.lastModified).getTime()) / (1000 * 60 * 60 * 24 * 30)) : null
    candidates.push({ value: s.osm.freshnessScore, text: months ? `Dati OSM non aggiornati da circa ${months} mesi` : 'Dati OSM non aggiornati da molto tempo' })
  }
  if (s.satellite.firePenalty < 0) {
    candidates.push({ value: s.satellite.firePenalty, text: 'Possibile area incendiata rilevata via satellite' })
  }
  if (s.satellite.floodPenalty < 0) {
    candidates.push({
      value: s.satellite.floodPenalty,
      text: s.satellite.floodSource === 'pai'
        ? `Rischio alluvione ufficiale (PAI${s.satellite.paiFloodClass ? `, classe ${s.satellite.paiFloodClass}` : ''})`
        : 'Possibile area alluvionata rilevata via satellite',
    })
  }
  if (s.satellite.landslidePenalty < 0) {
    candidates.push({
      value: s.satellite.landslidePenalty,
      text: s.satellite.landslideSource === 'pai'
        ? `Rischio frana ufficiale (PAI${s.satellite.paiLandslideClass ? `, classe ${s.satellite.paiLandslideClass}` : ''})`
        : 'Possibile rischio frana rilevato via satellite',
    })
  }
  if (s.satellite.ndviDeltaPenalty < 0) {
    candidates.push({ value: s.satellite.ndviDeltaPenalty, text: 'Variazione anomala della vegetazione rilevata via satellite' })
  }
  if (s.community.osmNotesPenalty < 0) {
    const closest = [...s.community.osmNotesDetails].sort((a, b) => a.distanceM - b.distanceM)[0]
    candidates.push({
      value: s.community.osmNotesPenalty,
      text: closest ? `Segnalazione recente della comunità OSM a ${closest.distanceM}m` : 'Segnalazioni recenti della comunità OSM nelle vicinanze',
    })
  }
  if (s.community.difficultyMarkersPenalty < 0) {
    const worst = [...s.community.difficultyMarkersDetails].sort((a, b) => a.distanceM - b.distanceM)[0]
    candidates.push({
      value: s.community.difficultyMarkersPenalty,
      text: worst ? `Tratto difficile segnalato nel tracciato GPX a ${worst.distanceM}m` : 'Tratti difficili segnalati nel tracciato GPX importato',
    })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.value - b.value)
  return candidates[0].text
}

interface SiCacheFields {
  siScore: number | null
  siSignals: CLSignals | null
  siStaticComputedAt: string | null
  siDynamicComputedAt: string | null
  siSatelliteComputedAt: string | null
  isGhostTrail: boolean
}

interface SiPipelineResult {
  signals: CLSignals
  score: number
  label: CLLabel
  dominantWarning: string | null
  isGhostTrail: boolean
  partial: boolean
  staticExpired: boolean
  dynamicExpired: boolean
  satelliteExpired: boolean
}

// Pure scoring pipeline shared by computeCL (OSM trail, `trails` cache) and
// computeCLForPlannedHike (arbitrary GPX track, `planned_hikes` cache) — no
// I/O besides the collectors themselves. `overpassRelationId` is the only
// thing genuinely tied to OSM (relation tags via Overpass): pass null for a
// track with no OSM correspondence and every collector below degrades to
// its already-existing neutral fallback (same as when Overpass itself is
// unreachable), since none of them otherwise use the id parameter.
async function runClPipeline(
  geometry: [number, number][],
  bbox: SignalContext['bbox'],
  distanceKm: number | null,
  elevationGain: number | null,
  elevationLoss: number | null,
  cached: SiCacheFields,
  overpassRelationId: number | null,
  force = false,
): Promise<SiPipelineResult> {
  const now = Date.now()
  const staticExpired = force || !cached.siStaticComputedAt || now - new Date(cached.siStaticComputedAt).getTime() > STATIC_TTL_MS
  const dynamicExpired = force || !cached.siDynamicComputedAt || now - new Date(cached.siDynamicComputedAt).getTime() > DYNAMIC_TTL_MS
  const satelliteExpired = force || !cached.siSatelliteComputedAt || now - new Date(cached.siSatelliteComputedAt).getTime() > SATELLITE_TTL_MS

  const needsOsmTags = staticExpired || dynamicExpired // weather (dynamic) reads ctx.osmTags.surface
  const needsMatch = dynamicExpired // activity (dynamic) reads ctx.matchedActivity

  // findMatchingActivity interroga tutto lo storico attività dell'utente (fino a 3 anni) — a
  // differenza dei collector veri e propri qui sotto (ognuno già avvolto in withTimeout), questa
  // chiamata non aveva un proprio limite: su uno storico ampio poteva da sola avvicinarsi al
  // budget totale della richiesta (COMPUTE_TIMEOUT_MS in app/api/trails/cl/route.ts), lasciando
  // troppo poco tempo ai collector effettivi che calcolano il punteggio.
  const [tagsResult, matchResult] = await Promise.all([
    needsOsmTags && overpassRelationId != null ? fetchOsmTags(overpassRelationId) : Promise.resolve({ tags: {}, lastModified: null }),
    needsMatch ? withTimeout(findMatchingActivity(geometry, bbox), COLLECTOR_TIMEOUT_MS).catch(() => null) : Promise.resolve(null),
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

  // Spread onto NEUTRAL_* (not a plain `?? NEUTRAL_X` fallback) so that a
  // cached si_signals blob written by an older deploy — missing fields a
  // later schema change added to one of these shapes — gets those fields
  // backfilled instead of propagating `undefined` into computeScore()'s
  // arithmetic (which turns into NaN, silently serialized as `null` by
  // JSON, which then made CLBadge render nothing).
  const cachedSignals = cached.siSignals
  const signals: CLSignals = {
    osm:       (fresh.osm as OsmSignal) ?? { ...NEUTRAL_OSM, ...cachedSignals?.osm },
    weather:   (fresh.weather as WeatherSignal) ?? { ...NEUTRAL_WEATHER, ...cachedSignals?.weather },
    climate:   (fresh.climate as ClimateSignal) ?? { ...NEUTRAL_CLIMATE, ...cachedSignals?.climate },
    satellite: (fresh.satellite as SatelliteSignal) ?? { ...NEUTRAL_SATELLITE, ...cachedSignals?.satellite },
    activity:  (fresh.activity as ActivitySignal) ?? { ...NEUTRAL_ACTIVITY, ...cachedSignals?.activity },
    community: (fresh.community as CommunitySignal) ?? { ...NEUTRAL_COMMUNITY, ...cachedSignals?.community },
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
  const label = labelForSiScore(score)
  const dominantWarning = dominantWarningFor(signals)

  return { signals, score, label, dominantWarning, isGhostTrail, partial, staticExpired, dynamicExpired, satelliteExpired }
}

export async function computeCL(
  osmRelationId: number,
  precomputedGeometry?: { bbox: SignalContext['bbox']; geometrySimplified: [number, number][] },
  opts?: { force?: boolean },
): Promise<CLResult> {
  const trailRow = await fetchTrailSiRow(osmRelationId)

  if (opts?.force && trailRow?.siDynamicComputedAt) {
    const elapsed = Date.now() - new Date(trailRow.siDynamicComputedAt).getTime()
    if (elapsed < FORCE_REFRESH_COOLDOWN_MS) {
      throw new CLRateLimitError(new Date(new Date(trailRow.siDynamicComputedAt).getTime() + FORCE_REFRESH_COOLDOWN_MS).toISOString())
    }
  }

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

  const result = await runClPipeline(
    geometry, bbox,
    trailRow?.distanceKm ?? null, trailRow?.elevationGain ?? null, trailRow?.elevationLoss ?? null,
    cached, osmRelationId, opts?.force,
  )

  const cachedAt = new Date().toISOString()
  // DB columns are intentionally kept as `si_*` to avoid a DB migration —
  // only in-code symbols were renamed SI -> CL.
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

  const { error } = await supabase.from('trails').update(updatePayload).eq('osm_relation_id', osmRelationId)
  if (error) console.error('[computeCL] update trails failed', error)

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
// Same scoring pipeline as computeCL, but cached on the planned_hikes row
// itself instead of the shared `trails` cache — see
// supabase/migrations/add_planned_hikes_si_sentinel2_columns.sql.
export async function computeCLForPlannedHike(
  plannedHikeId: string,
  geometry: [number, number][],
  bbox: SignalContext['bbox'],
  distanceKm: number | null,
  elevationGain: number | null,
  elevationLoss: number | null,
  opts?: { force?: boolean },
): Promise<CLResult> {
  const cached = await fetchPlannedSiCache(plannedHikeId)

  if (opts?.force && cached.siDynamicComputedAt) {
    const elapsed = Date.now() - new Date(cached.siDynamicComputedAt).getTime()
    if (elapsed < FORCE_REFRESH_COOLDOWN_MS) {
      throw new CLRateLimitError(new Date(new Date(cached.siDynamicComputedAt).getTime() + FORCE_REFRESH_COOLDOWN_MS).toISOString())
    }
  }

  const result = await runClPipeline(geometry, bbox, distanceKm, elevationGain, elevationLoss, cached, null, opts?.force)

  const cachedAt = new Date().toISOString()
  // DB columns are intentionally kept as `si_*` to avoid a DB migration —
  // only in-code symbols were renamed SI -> CL.
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

  const { error } = await supabase.from('planned_hikes').update(updatePayload).eq('id', plannedHikeId)
  if (error) console.error('[computeCL] update planned_hikes failed', error)

  return {
    plannedHikeId, si: result.score, label: result.label, isGhostTrail: result.isGhostTrail,
    dominantWarning: result.dominantWarning, signals: result.signals, partial: result.partial, cachedAt,
  }
}
