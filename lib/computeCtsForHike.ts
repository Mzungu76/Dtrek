import type { PoiItem } from './overpass'
import { computeTrailScore, type CtsConfidence } from './trailScore'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from './tei'
import type { TrailDtmProfile } from './dtm/trailDtmProfile'
import type { TrailTerrainProfile } from './terrain/trailTerrainProfile'
import { checkProtectedArea } from './natura2000/checkProtectedArea'
import { computeBbox, minDistToTrack } from './geoUtils'
import { updatePlannedMeta, type PlannedHike } from './plannedStore'
import { refreshTsForHike } from './computeTsForHike'
import type { BeautyScore } from './beautyScore'
import { getUserSettingsCached } from './sync/userSettingsStore'

const FETCH_TIMEOUT_MS = 25000

/** Whatever the caller already has in memory for this same hike — passing it in skips the
 *  matching network fetch below instead of repeating a request a sibling effect/handler already
 *  made (or is already making) for the exact same bbox/track. Anything omitted is fetched as
 *  before, so a fire-and-forget caller with no page-local state (e.g. right after import) still
 *  works unchanged. */
export interface CtsPrefetched {
  pois?: PoiItem[]
  dtmProfile?: TrailDtmProfile
  terrainProfile?: TrailTerrainProfile
  inProtectedArea?: boolean
  prefs?: { prefSforzo?: number; prefDurata?: number; hrRest?: number; hrMax?: number }
}

export interface CtsCoreInput {
  trackPoints?: PlannedHike['trackPoints']
  elevationGain: number
  distanceMeters: number
  elevationLoss: number
  altitudeMax: number
  avgHeartRate?: number
}

export interface CtsCoreResult {
  beautyScore: BeautyScore
  ts: number
  confidence: CtsConfidence
  /** POIs found within 300m of the track (post-filter) — callers with their own "no POIs at all"
   *  fallback (see lib/recalcScores.ts's getCtsFallback path) key off this instead of confidence,
   *  which reflects cultural-POI relevance specifically, not POI presence in general. */
  poisCount: number
}

/**
 * Runs the full CTS pipeline (POIs, OSM tags, DTM slope/aspect, terrain, protected-area overlap)
 * for a hike and returns the result WITHOUT persisting it — shared by computeCtsForHike (planned
 * hikes, persists via updatePlannedMeta) and lib/recalcScores.ts's bulk recompute (activities +
 * planned hikes, persists via updateActivityMeta/updatePlannedMeta respectively), so the two
 * don't each carry their own copy of this fetch+TEI+TrailScore pipeline.
 */
export async function computeCtsCore(hike: CtsCoreInput, prefetched?: CtsPrefetched): Promise<CtsCoreResult | null> {
  const gps = (hike.trackPoints ?? [])
    .filter(p => p.lat && p.lon)
    .map(p => [p.lat!, p.lon!] as [number, number])
  if (gps.length < 2) return null

  const deadline = <T>(): Promise<T | null> => new Promise(r => setTimeout(() => r(null), FETCH_TIMEOUT_MS))
  const bbox = computeBbox(gps)

  const [allPoisRes, osmData, dtmProfile, terrainProfile, protectedArea] = await Promise.all([
    prefetched?.pois
      ? Promise.resolve(prefetched.pois)
      : Promise.race([fetch(`/api/pois?bbox=${bbox}`).then(r => r.json()) as Promise<PoiItem[]>, deadline<PoiItem[]>()]).then(r => r ?? []).catch(() => []),
    Promise.race([fetch(`/api/tei-overpass?bbox=${bbox}`).then(r => r.json()) as Promise<OsmTeiData>, deadline<OsmTeiData>()]).then(r => r ?? undefined).catch(() => undefined),
    prefetched?.dtmProfile !== undefined
      ? Promise.resolve(prefetched.dtmProfile)
      : fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()).catch(() => undefined) as Promise<TrailDtmProfile | undefined>,
    prefetched?.terrainProfile !== undefined
      ? Promise.resolve(prefetched.terrainProfile)
      : fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`).then(r => r.json()).catch(() => undefined) as Promise<TrailTerrainProfile | undefined>,
    prefetched?.inProtectedArea !== undefined
      ? Promise.resolve({ inProtectedArea: prefetched.inProtectedArea })
      : checkProtectedArea(gps).catch(() => undefined),
  ])

  const pois = allPoisRes
    .filter(p => minDistToTrack(p.lat, p.lon, gps) <= 300)
    .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, gps)) }))

  const elevProfile = (hike.trackPoints ?? [])
    .filter(p => p.lat && p.lon)
    .map(p => p.altitudeMeters ?? 0)

  const tei = computeTEI({
    track: gps,
    elevGain: hike.elevationGain,
    distanceMeters: hike.distanceMeters,
    altitudeMax: hike.altitudeMax,
    elevProfile,
    pois,
    osmData,
    dtmProfile,
    terrainProfile,
    inProtectedArea: protectedArea?.inProtectedArea,
  })
  const bs = teiToBeautyScore(tei)
  const confidence: CtsConfidence = tei.confidence

  const prefs = prefetched?.prefs ?? await getUserSettingsCached()
  let { ts } = computeTrailScore(bs, {
    distanceMeters: hike.distanceMeters,
    elevationGain:  hike.elevationGain,
    elevationLoss:  hike.elevationLoss,
    altitudeMax:    hike.altitudeMax,
    avgHeartRate:   hike.avgHeartRate,
    prefSforzo:     prefs.prefSforzo,
    prefDurata:     prefs.prefDurata,
    hrRest:         prefs.hrRest ?? undefined,
    hrMax:          prefs.hrMax ?? undefined,
    avgSlopeDeg:    dtmProfile?.avgSlopeDeg ?? undefined,
  })
  if (confidence === 'estimated') ts = Math.round(ts * 0.9)

  return { beautyScore: bs, ts, confidence, poisCount: pois.length }
}

/**
 * Runs computeCtsCore for a planned hike and persists the result, then triggers a Trail Score
 * v2 recompute (lib/computeTsForHike.ts) so the aggregate never lags behind its own CTS input.
 * Self-contained: fetches everything it doesn't already have rather than requiring page-local
 * state, so it can still run fire-and-forget right after a hike is added (no `prefetched`), not
 * just from a page that has already loaded some of the same data for its own UI.
 */
export async function computeCtsForHike(hike: Pick<PlannedHike,
  'id' | 'trackPoints' | 'elevationGain' | 'distanceMeters' | 'elevationLoss' | 'altitudeMax'
>, prefetched?: CtsPrefetched): Promise<{ cachedBeautyScore: BeautyScore; cachedTrailScore: number; cachedTrailScoreConfidence: CtsConfidence; cachedScoresComputedAt: string } | null> {
  const core = await computeCtsCore(hike, prefetched)
  if (!core) return null

  const result = {
    cachedBeautyScore: core.beautyScore, cachedTrailScore: core.ts, cachedTrailScoreConfidence: core.confidence,
    cachedScoresComputedAt: new Date().toISOString(),
  }
  await updatePlannedMeta(hike.id, result)
  refreshTsForHike(hike.id).catch(() => {})
  return result
}
