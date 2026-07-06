import type { PoiItem } from './overpass'
import { computeTrailScore, type CtsConfidence } from './trailScore'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from './tei'
import type { TrailDtmProfile } from './dtm/trailDtmProfile'
import type { TrailTerrainProfile } from './terrain/trailTerrainProfile'
import { checkProtectedArea } from './natura2000/checkProtectedArea'
import { computeBbox, minDistToTrack } from './geoUtils'
import { updatePlannedMeta, type PlannedHike } from './plannedStore'
import type { BeautyScore } from './beautyScore'

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

/**
 * Runs the full CTS pipeline (POIs, OSM tags, DTM slope/aspect, terrain,
 * protected-area overlap) for a planned hike and persists the result.
 * Self-contained: fetches everything it doesn't already have rather than
 * requiring page-local state, so it can still run fire-and-forget right
 * after a hike is added (no `prefetched`), not just from a page that has
 * already loaded some of the same data for its own UI.
 */
export async function computeCtsForHike(hike: Pick<PlannedHike,
  'id' | 'trackPoints' | 'elevationGain' | 'distanceMeters' | 'elevationLoss' | 'altitudeMax'
>, prefetched?: CtsPrefetched): Promise<{ cachedBeautyScore: BeautyScore; cachedTrailScore: number; cachedTrailScoreConfidence: CtsConfidence; cachedScoresComputedAt: string } | null> {
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

  const prefs = prefetched?.prefs ?? await fetch('/api/user-settings').then(r => r.json()).catch(() => ({}))
  let { ts } = computeTrailScore(bs, {
    distanceMeters: hike.distanceMeters,
    elevationGain:  hike.elevationGain,
    elevationLoss:  hike.elevationLoss,
    altitudeMax:    hike.altitudeMax,
    prefSforzo:     prefs.prefSforzo,
    prefDurata:     prefs.prefDurata,
    hrRest:         prefs.hrRest,
    hrMax:          prefs.hrMax ?? undefined,
    avgSlopeDeg:    dtmProfile?.avgSlopeDeg ?? undefined,
  })
  if (confidence === 'estimated') ts = Math.round(ts * 0.9)

  const result = {
    cachedBeautyScore: bs, cachedTrailScore: ts, cachedTrailScoreConfidence: confidence,
    cachedScoresComputedAt: new Date().toISOString(),
  }
  await updatePlannedMeta(hike.id, result)
  return result
}
