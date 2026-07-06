import type { PoiItem } from './overpass'
import { computeTrailScore, type CtsConfidence } from './trailScore'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from './tei'
import type { TrailDtmProfile } from './dtm/trailDtmProfile'
import type { TrailTerrainProfile } from './terrain/trailTerrainProfile'
import { checkProtectedArea } from './natura2000/checkProtectedArea'
import { computeBbox, minDistToTrack } from './geoUtils'
import { updateActivityMeta, type StoredActivity } from './blobStore'
import type { BeautyScore } from './beautyScore'

const FETCH_TIMEOUT_MS = 25000

/** Same shortcut as computeCtsForHike's CtsPrefetched — skips the matching fetch when the
 *  caller already has the data in page-local state. */
export interface CtsActivityPrefetched {
  pois?: PoiItem[]
  dtmProfile?: TrailDtmProfile
  terrainProfile?: TrailTerrainProfile
  inProtectedArea?: boolean
  prefs?: { prefSforzo?: number; prefDurata?: number; hrRest?: number; hrMax?: number }
}

/**
 * Activity counterpart of computeCtsForHike — same self-contained CTS pipeline, persisted via
 * updateActivityMeta instead of updatePlannedMeta. Lets a completed hike's CTS auto-refresh on
 * open (once stale) without going through the heavier saveActivityWithEnrichment/full re-save.
 */
export async function computeCtsForActivity(activity: Pick<StoredActivity,
  'id' | 'trackPoints' | 'elevationGain' | 'distanceMeters' | 'elevationLoss' | 'altitudeMax' | 'avgHeartRate'
>, prefetched?: CtsActivityPrefetched): Promise<{ linkedBeautyScore: BeautyScore; trailScore: number; trailScoreConfidence: CtsConfidence; trailScoreComputedAt: string } | null> {
  const gps = (activity.trackPoints ?? [])
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

  const elevProfile = (activity.trackPoints ?? [])
    .filter(p => p.lat && p.lon)
    .map(p => p.altitudeMeters ?? 0)

  const tei = computeTEI({
    track: gps,
    elevGain: activity.elevationGain,
    distanceMeters: activity.distanceMeters,
    altitudeMax: activity.altitudeMax,
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
    distanceMeters: activity.distanceMeters,
    elevationGain:  activity.elevationGain,
    elevationLoss:  activity.elevationLoss ?? 0,
    altitudeMax:    activity.altitudeMax,
    avgHeartRate:   activity.avgHeartRate,
    prefSforzo:     prefs.prefSforzo,
    prefDurata:     prefs.prefDurata,
    hrRest:         prefs.hrRest,
    hrMax:          prefs.hrMax ?? undefined,
    avgSlopeDeg:    dtmProfile?.avgSlopeDeg ?? undefined,
  })
  if (confidence === 'estimated') ts = Math.round(ts * 0.9)

  const result = {
    linkedBeautyScore: bs, trailScore: ts, trailScoreConfidence: confidence,
    trailScoreComputedAt: new Date().toISOString(),
  }
  await updateActivityMeta(activity.id, result)
  return result
}
