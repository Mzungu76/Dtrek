import type { TcxActivity, TrackPoint } from './tcxParser'
import { saveActivity, type StoredActivity, type HikeNote } from './blobStore'
import { deletePlanned, getPlannedById } from './plannedStore'
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
  /** Set only by the standalone Navigator app's free-track recording flow (app/navigatore/traccia) — see lib/navigatorSlot.ts. Never set by the main app's own upload/save flows. */
  sourceApp?: 'navigator'
  /**
   * Fired once the underlying saveActivity() call resolves: `ok: true` means it reached Supabase
   * just now, `false` means it couldn't (offline/network failure) and fell back to the local
   * outbox for later sync (lib/sync/syncEngine.ts) — the record itself is never lost either way
   * (it's written to IndexedDB first, before any network attempt), but callers with an end-of-hike
   * confirmation screen (ActiveNavigationView, app/navigatore/traccia) use this to tell the hiker
   * "salvato in locale, verrà sincronizzato" instead of implying it's already on the server.
   */
  onSyncResult?: (ok: boolean) => void
}

/** navigator.onLine can false-negative on mobile (see lib/sync/syncEngine.ts's flush() comment for
 *  the same caveat) — never used to skip a *retry*, only here to avoid firing off a string of
 *  doomed 18s-timeout fetches when there's clearly no connection at all, which otherwise stacked up
 *  to roughly a minute of stall between "Termina" and the hike actually being saved (safely) to the
 *  local cache/outbox below. A false negative just means enrichment is skipped when it might have
 *  worked — no data is lost either way, since it's already best-effort/non-blocking. */
function isDefinitelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
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
  // ── CTS analysis (best-effort, 18s deadline per fetch) ───────────────────
  let linkedBeautyScore: StoredActivity['linkedBeautyScore']
  let trailScore: number | undefined
  let trailScoreConfidence: StoredActivity['trailScoreConfidence']
  let trailScoreComputedAt: string | undefined
  try {
    const gps = (activity.trackPoints ?? [])
      .filter((p) => p.lat && p.lon)
      .map((p) => [p.lat!, p.lon!] as [number, number])
    if (gps.length >= 2 && !isDefinitelyOffline()) {
      const deadline = new Promise<null>((r) => setTimeout(() => r(null), 18000))
      const bbox = computeBbox(gps)
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
      // Independent of one another (and of the three above) — fired together instead of two
      // sequential awaits, which used to be able to stack up to ~36s of pure waiting (18s each,
      // back to back) on top of the deadlines above, on a flaky/slow connection.
      const poisPromise = Promise.race([fetchPoisNearTrack(gps, 300), deadline]).then((r) => r ?? [])
      const osmDataPromise = Promise.race([
        fetch(`/api/tei-overpass?bbox=${bbox}`).then((r) => r.json()) as Promise<OsmTeiData>,
        deadline,
      ]).then((r) => r ?? undefined).catch(() => undefined)
      const pois = (await poisPromise) as PoiItem[]
      const elevProfile = (activity.trackPoints ?? [])
        .filter((p) => p.lat && p.lon)
        .map((p) => p.altitudeMeters ?? 0)
      const osmData = await osmDataPromise
      const dtmProfile = await dtmPromise
      const terrainProfile = await terrainPromise
      const inProtectedArea = await protectedAreaPromise
      const prefs = await getUserSettingsCached()
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
        prefSforzo: prefs.prefSforzo,
        weights: {
          cultura: prefs.teiPesoCultura, topografia: prefs.teiPesoTopografia, idrografia: prefs.teiPesoIdrografia,
          fondo: prefs.teiPesoFondo, geodiversita: prefs.teiPesoGeodiversita,
        },
        fAntrSensitivity: prefs.teiFAntrSensitivity,
      })
      const bs = teiToBeautyScore(tei)
      const confidence = tei.confidence
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

  // ── Guida del percorso (best-effort) ───────────────────────────
  // Va letta PRIMA del deletePlanned più sotto: quella riga porta con sé il testo della guida
  // scritto da Giulia e l'abbinamento POI↔Wikipedia (immagini comprese), materiale generato una
  // volta sola e altrimenti perso per sempre nel momento in cui il piano viene consumato in questa
  // attività. Il resoconto e il video ne hanno bisogno per raccontare il percorso, non solo mostrarlo.
  let guideCarry: Pick<StoredActivity, 'guideText'|'guideSubtitle'|'guideNotices'|'guideGeneratedAt'|'poiWiki'> = {}
  if (opts.linkedPlannedId) {
    try {
      const planned = await getPlannedById(opts.linkedPlannedId)
      if (planned) {
        guideCarry = {
          guideText:        planned.cachedGuide,
          guideSubtitle:    planned.cachedGuideSubtitle,
          guideNotices:     planned.cachedGuideNotices,
          guideGeneratedAt: planned.guideGeneratedAt,
          poiWiki:          planned.cachedPoiWiki as StoredActivity['poiWiki'],
        }
      }
    } catch {} // non-blocking — un'escursione non deve fallire il salvataggio per la sua guida
  }

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
    sourceApp: opts.sourceApp,
    ...guideCarry,
  }
  const { ok } = await saveActivity(stored)
  opts.onSyncResult?.(ok)

  if (opts.deleteLinkedPlanned && opts.linkedPlannedId) {
    await deletePlanned(opts.linkedPlannedId).catch(() => {})
  }

  // Aggiorna lo storico aggregato (lib/hikerHistory.ts) usato dalla sezione guida "Su misura per
  // te" — fire-and-forget, non deve mai bloccare o far fallire il salvataggio dell'escursione.
  // Unico punto in cui una NUOVA escursione completata viene salvata (vedi commento sopra sulla
  // funzione condivisa), quindi il posto giusto per incrementare, non un'edit successiva.
  fetch('/api/user-settings/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      distanceMeters: stored.distanceMeters,
      elevationGain: stored.elevationGain,
      totalTimeSeconds: stored.totalTimeSeconds,
      completedAt: stored.startTime,
    }),
  }).catch(() => {})

  return stored
}
