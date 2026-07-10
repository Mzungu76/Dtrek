import type { TcxActivity, TrackPoint } from './tcxParser'
import { saveActivity, type StoredActivity, type HikeNote } from './blobStore'
import { deletePlanned } from './plannedStore'
import { fetchPoisNearTrack } from './poisProxy'
import { type PoiItem } from './overpass'
import { computeTEI, teiToBeautyScore, type OsmTeiData } from './tei'
import type { TrailDtmProfile } from './dtm/trailDtmProfile'
import type { TrailTerrainProfile } from './terrain/trailTerrainProfile'
import { checkProtectedArea } from './natura2000/checkProtectedArea'
import { computeTrailScore } from './trailScore'
import { computeBbox } from './geoUtils'
import { fetchWeatherAtHike, type WeatherAtHike } from './openmeteo'
import { getUserSettingsCached } from './sync/userSettingsStore'

export interface SaveActivityOptions {
  title?: string
  fileName?: string
  linkedPlannedId?: string
  linkedPlannedTrackPoints?: TrackPoint[]
  hikeNotes?: HikeNote[]
  /** Deletes the planned_hikes row at linkedPlannedId after a successful save — the plan is "consumed" into the completed activity, same behavior as linking an imported GPX to a plan. */
  deleteLinkedPlanned?: boolean
}

/**
 * Shared save path for both the /upload import flow and the post-navigation
 * "save recorded hike" flow: best-effort CTS (beauty/trail score) and
 * historical weather enrichment, then the actual saveActivity() call, then
 * (optionally) deleting the planned hike it was linked to. Extracted from
 * app/upload/page.tsx's handleSave so both flows share one enrichment
 * implementation instead of drifting apart.
 */
export async function saveActivityWithEnrichment(
  activity: TcxActivity,
  opts: SaveActivityOptions = {},
): Promise<StoredActivity> {
  // ── CTS analysis (best-effort, 18s deadline) ───────────────────
  let linkedBeautyScore: StoredActivity['linkedBeautyScore']
  let trailScore: number | undefined
  let trailScoreConfidence: StoredActivity['trailScoreConfidence']
  let trailScoreComputedAt: string | undefined
  try {
    const gps = (activity.trackPoints ?? [])
      .filter((p) => p.lat && p.lon)
      .map((p) => [p.lat!, p.lon!] as [number, number])
    if (gps.length >= 2) {
      const deadline = new Promise<null>((r) => setTimeout(() => r(null), 18000))
      const dtmPromise = Promise.race([
        fetch(`/api/tei-dtm?track=${encodeURIComponent(JSON.stringify(gps))}`).then((r) => r.json()) as Promise<TrailDtmProfile>,
        deadline,
      ]).then((r) => r ?? undefined).catch(() => undefined)
      const terrainPromise = Promise.race([
        fetch(`/api/tei-terrain?track=${encodeURIComponent(JSON.stringify(gps))}`).then((r) => r.json()) as Promise<TrailTerrainProfile>,
        deadline,
      ]).then((r) => r ?? undefined).catch(() => undefined)
      const protectedAreaPromise = Promise.race([
        checkProtectedArea(gps).then((r) => r.inProtectedArea),
        deadline,
      ]).then((r) => r ?? undefined).catch(() => undefined)
      const rawPois = await Promise.race([fetchPoisNearTrack(gps, 300), deadline]).then((r) => r ?? [])
      const pois = rawPois as PoiItem[]
      const bbox = computeBbox(gps)
      const elevProfile = (activity.trackPoints ?? [])
        .filter((p) => p.lat && p.lon)
        .map((p) => p.altitudeMeters ?? 0)
      const osmData = await Promise.race([
        fetch(`/api/tei-overpass?bbox=${bbox}`).then((r) => r.json()) as Promise<OsmTeiData>,
        deadline,
      ]).then((r) => r ?? undefined).catch(() => undefined)
      const dtmProfile = await dtmPromise
      const terrainProfile = await terrainPromise
      const inProtectedArea = await protectedAreaPromise
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
        inProtectedArea,
      })
      const bs = teiToBeautyScore(tei)
      const confidence = tei.confidence
      const prefs = await getUserSettingsCached()
      let { ts } = computeTrailScore(bs, {
        distanceMeters: activity.distanceMeters,
        elevationGain: activity.elevationGain,
        elevationLoss: activity.elevationLoss ?? 0,
        altitudeMax: activity.altitudeMax,
        avgHeartRate: activity.avgHeartRate,
        userAge: prefs.userAge,
        personalDelta: prefs.personalDelta ?? undefined,
        hrHikeCount: prefs.hrHikeCount,
        prefSforzo: prefs.prefSforzo,
        prefDurata: prefs.prefDurata,
        avgSlopeDeg: dtmProfile?.avgSlopeDeg ?? undefined,
      }, prefs.beautyNaturaWeight ?? 50)
      if (confidence === 'estimated') ts = Math.round(ts * 0.9)
      linkedBeautyScore = bs
      trailScore = ts
      trailScoreConfidence = confidence
      trailScoreComputedAt = new Date().toISOString()
    }
  } catch {} // non-blocking — save proceeds regardless

  // ── Historical weather (best-effort) ────────────────────────────
  let weatherAtHike: WeatherAtHike | undefined
  try {
    const gpsPt = (activity.trackPoints ?? []).find((p) => p.lat !== undefined && p.lon !== undefined)
    if (gpsPt && activity.startTime) {
      const date = activity.startTime.slice(0, 10)
      weatherAtHike = (await fetchWeatherAtHike(gpsPt.lat!, gpsPt.lon!, date)) ?? undefined
    }
  } catch {} // non-blocking — save proceeds regardless

  // ── Save ───────────────────────────────────────────────────────
  const stored: StoredActivity = {
    ...activity,
    title: opts.title?.trim() || undefined,
    fileName: opts.fileName,
    linkedPlannedId: opts.linkedPlannedId,
    linkedPlannedTrackPoints: opts.linkedPlannedTrackPoints,
    hikeNotes: opts.hikeNotes,
    linkedBeautyScore,
    trailScore,
    trailScoreConfidence,
    trailScoreComputedAt,
    weatherAtHike,
  }
  await saveActivity(stored)

  if (opts.deleteLinkedPlanned && opts.linkedPlannedId) {
    await deletePlanned(opts.linkedPlannedId).catch(() => {})
  }

  return stored
}
