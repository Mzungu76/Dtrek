import { TcxActivity, type TrackPoint } from './tcxParser'
import { lsGet, lsSet, lsDel, LS_KEYS, obEnqueue } from './localStore'
import { registerEntityFlusher, scheduleFlush, flushRows } from './sync/syncEngine'
import { registerListReconciler } from './sync/pullEngine'
import { apiFetch, isPermanentClientError } from './apiFetch'
import type { BeautyScore } from './beautyScore'
import type { CtsConfidence } from './trailScore'
import type { WeatherAtHike } from './openmeteo'
import type { GuideNotice } from './guideNotices'
import type { PoiItem } from './overpass'
import type { WikiPage } from './wikipedia'
import { computeDEP } from './stats'
import { downsamplePolyline } from './downsamplePolyline'
import type { MetaType, SiteType } from './metaTypes'

const ENTITY_TYPE = 'activity'

export interface HikeNote {
  id:        string
  text:      string
  timestamp: string
  lat?:      number
  lon?:      number
  /** Optional photo attached to the note — normally a Supabase Storage public URL, but see photoPending below for the offline case. A note can be text-only, voice-dictated text, a photo, or both. */
  photoUrl?: string
  photoStoragePath?: string
  /** True when photoUrl is a local data: URL rather than a Storage URL — the upload couldn't reach
   *  Supabase Storage when the note was taken (offline, or a flaky connection on the trail) and was
   *  kept locally instead of losing the note entirely (see FieldNoteSheet.tsx). Still fully usable
   *  (the photo displays fine from the data URL); a best-effort background retry
   *  (lib/offline/retryFieldNotePhotos.ts) tries to swap it for a real Storage URL once online, but
   *  nothing depends on that succeeding. */
  photoPending?: boolean
}

export interface StoredActivity extends TcxActivity {
  /** Server-side last-modified timestamp — used by lib/sync/pullEngine.ts to detect a
   *  newer copy on another device without re-downloading the whole record. */
  updatedAt?: string
  userNotes?: string
  hikeNotes?: HikeNote[]
  title?: string
  tags?: string[]
  fileName?: string
  userRating?: number
  userRatingNote?: string
  linkedPlannedId?: string
  linkedPlannedTrackPoints?: TrackPoint[]
  soddisfazione?: number  // satisfaction 1–10
  linkedBeautyScore?: BeautyScore
  trailScore?: number
  trailScoreConfidence?: CtsConfidence
  // When linkedBeautyScore+trailScore were last computed — see lib/scoreFreshness.ts.
  trailScoreComputedAt?: string
  depKm?: number
  weatherAtHike?: WeatherAtHike
  // ── Guida del percorso, travasata dal piano al momento del salvataggio ─────
  // Il testo della guida vive su planned_hikes, e quella riga viene cancellata quando il piano
  // viene "consumato" in questa attività (lib/activitySave.ts). Questi campi ne conservano il
  // contenuto qui, altrimenti andrebbe perso — vedi supabase/migrations/add_activity_guide_columns.sql.
  // Assenti su tutte le attività salvate prima di questa colonna e su quelle mai pianificate
  // (import GPX diretto): chi li legge deve trattarli come opzionali, non come garantiti.
  guideText?: string
  guideSubtitle?: string
  guideNotices?: (GuideNotice | string)[]
  /** Data di generazione della guida — gli avvisi sopra sono una fotografia del web a quella data. */
  guideGeneratedAt?: string
  poiWiki?: { poi: PoiItem; wiki: WikiPage }[]
  // Preferito nella galleria Resoconto — vedi components/routehub/BottomGallery.tsx (stella sulla
  // scheda chiusa) e app/resoconto/ResocontoHub.tsx (filtro "Preferiti"), stesso concetto già
  // esistente per planned_hikes (vedi lib/plannedStore.ts).
  favorite?: boolean
  /** Set only when this activity was recorded through the standalone Navigator app's free-track
   *  flow (lib/navigatorSlot.ts) — same convention/purpose as PlannedHike.sourceApp. */
  sourceApp?: 'navigator'
  // Travasati dalla Meta al salvataggio (lib/activitySave.ts), stesso principio di guideText sopra
  // — vedi supabase/migrations/add_activities_meta_type_columns.sql. Assenti su ogni attività
  // salvata prima di questa colonna: chi li legge deve trattarli come 'sentiero' (il default di
  // colonna), mai come "tipologia sconosciuta".
  metaType?: MetaType
  siteType?: SiteType
}

export interface ActivityMeta {
  id: string
  title: string
  startTime: string
  updatedAt?: string
  distanceMeters: number
  totalTimeSeconds: number
  calories: number
  avgHeartRate: number
  maxHeartRate: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  avgSpeedMs: number
  maxSpeedMs: number
  tags?: string[]
  userNotes?: string
  fileName?: string
  routePolyline?: [number, number][]
  userRating?: number
  userRatingNote?: string
  soddisfazione?: number
  elevationProfile?: number[]  // downsampled altitude (m) for share-card profile chart
  linkedBeautyScore?: BeautyScore
  trailScore?: number
  trailScoreConfidence?: CtsConfidence
  trailScoreComputedAt?: string
  depKm?: number
  iev?: number
  favorite?: boolean
  sourceApp?: 'navigator'
  metaType?: MetaType
  siteType?: SiteType
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toMeta(a: StoredActivity): ActivityMeta {
  return {
    id:              a.id,
    sourceApp:       a.sourceApp,
    title:           a.title ?? a.notes ?? 'Escursione',
    startTime:       a.startTime,
    updatedAt:       a.updatedAt,
    distanceMeters:  a.distanceMeters,
    totalTimeSeconds: a.totalTimeSeconds,
    calories:        a.calories,
    avgHeartRate:    a.avgHeartRate,
    maxHeartRate:    a.maxHeartRate,
    elevationGain:   a.elevationGain,
    elevationLoss:   a.elevationLoss,
    altitudeMax:     a.altitudeMax,
    avgSpeedMs:      a.avgSpeedMs,
    maxSpeedMs:      a.maxSpeedMs,
    tags:            a.tags,
    userNotes:       a.userNotes,
    fileName:        a.fileName,
    routePolyline:   downsamplePolyline(a.trackPoints ?? []),
    userRating:      a.userRating,
    userRatingNote:  a.userRatingNote,
    soddisfazione:   a.soddisfazione,
    linkedBeautyScore:       a.linkedBeautyScore,
    trailScore:              a.trailScore,
    trailScoreConfidence:    a.trailScoreConfidence,
    trailScoreComputedAt:    a.trailScoreComputedAt,
    depKm:           computeDEP(a.distanceMeters, a.elevationGain),
    iev:             a.iev ?? undefined,  // a.iev is number | null | undefined (TcxActivity)
    favorite:        a.favorite,
    metaType:        a.metaType,
    siteType:        a.siteType,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
// Cache-first reads (IndexedDB is the source of truth for display) and queued
// writes (local cache updated instantly, Supabase sync happens in the
// background via lib/sync/syncEngine.ts) — see lib/sync/userSettingsStore.ts
// for the pattern this generalizes to a second, list-backed entity.

/** Returns the local list if present; only hits Supabase when there's no local copy yet (new device / cleared storage). */
export async function getAllActivities(onRefresh?: (data: ActivityMeta[]) => void): Promise<ActivityMeta[]> {
  const local = await lsGet<ActivityMeta[]>(LS_KEYS.activitiesList)
  if (local) {
    // Self-heal a known bad cache shape from before toMeta() included routePolyline: an activity
    // cached without one can never show its map-fallback cover/thumbnail (components/routehub/
    // CoverMap.tsx, BottomGallery.tsx's GalleryMapThumb) until it happens to be resaved or
    // reconciled — refresh once in the background instead of leaving it stuck like that.
    if (local.some(a => !a.routePolyline?.length)) {
      apiFetch<ActivityMeta[]>('/api/activities')
        .then(data => { lsSet(LS_KEYS.activitiesList, data); onRefresh?.(data) })
        .catch(() => {})
    }
    return local
  }
  try {
    const data = await apiFetch<ActivityMeta[]>('/api/activities')
    await lsSet(LS_KEYS.activitiesList, data)
    onRefresh?.(data)
    return data
  } catch {
    return []
  }
}

/** Returns the local copy if present; only hits Supabase when there's no local copy yet. */
export async function getActivityById(
  id: string,
  onRefresh?: (data: StoredActivity) => void,
): Promise<StoredActivity | null> {
  const local = await lsGet<StoredActivity>(LS_KEYS.activity(id))
  if (local) return local
  try {
    const data = await apiFetch<StoredActivity>(`/api/activity?id=${encodeURIComponent(id)}`)
    await lsSet(LS_KEYS.activity(id), data)
    onRefresh?.(data)
    return data
  } catch {
    return null
  }
}

/**
 * Applies the activity to the local cache immediately, then attempts a synchronous save —
 * mirroring lib/plannedStore.ts's savePlanned(), and for the same reason: the page the caller
 * navigates to right after saving (components/resoconto/ReportReader.tsx → app/api/resoconto/
 * route.ts, and others) reads this row directly from Supabase, and the outbox's ~15s debounce
 * (lib/sync/syncEngine.ts) is too slow to cover that. A permanent failure (4xx) rejects instead of
 * silently queuing, so the UI can show an error instead of navigating to a page for a row that was
 * never actually persisted; a transient failure (network, 5xx) still falls back to the outbox after
 * a couple of quick retries, so the record isn't lost.
 */
export async function saveActivity(activity: StoredActivity): Promise<{ ok: boolean }> {
  await lsSet(LS_KEYS.activity(activity.id), activity)
  const list = await lsGet<ActivityMeta[]>(LS_KEYS.activitiesList)
  const meta = toMeta(activity)
  const updated = [meta, ...(list ?? []).filter((a) => a.id !== activity.id)]
  await lsSet(LS_KEYS.activitiesList, updated)

  const RETRY_DELAYS_MS = [0, 1500, 3000]
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i]))
    try {
      return await apiFetch<{ ok: boolean }>('/api/activity', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(activity),
      })
    } catch (e) {
      if (isPermanentClientError(e)) throw e
      if (i === RETRY_DELAYS_MS.length - 1) {
        await obEnqueue(ENTITY_TYPE, activity.id, 'upsert', activity)
        scheduleFlush()
        return { ok: false }
      }
    }
  }
  return { ok: false } // irraggiungibile, soddisfa solo il controllo dei tipi
}

/** Applies a partial update to the local cache immediately and queues it for background sync. */
export async function updateActivityMeta(
  id: string,
  meta: Partial<Pick<StoredActivity, 'title' | 'userNotes' | 'hikeNotes' | 'tags' | 'userRating' | 'userRatingNote' | 'linkedPlannedId' | 'soddisfazione' | 'linkedBeautyScore' | 'trailScore' | 'trailScoreConfidence' | 'trailScoreComputedAt' | 'favorite'>>
): Promise<void> {
  const local = await lsGet<StoredActivity>(LS_KEYS.activity(id))
  if (local) await lsSet(LS_KEYS.activity(id), { ...local, ...meta })
  const list = await lsGet<ActivityMeta[]>(LS_KEYS.activitiesList)
  if (list) await lsSet(LS_KEYS.activitiesList, list.map((a) => a.id === id ? { ...a, ...meta } : a))
  await obEnqueue(ENTITY_TYPE, id, 'patch', meta)
  scheduleFlush()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
}

/** Removes from the local cache immediately and queues the deletion for background sync. */
export async function deleteActivity(id: string): Promise<void> {
  await lsDel(LS_KEYS.activity(id))
  const list = await lsGet<ActivityMeta[]>(LS_KEYS.activitiesList)
  if (list) await lsSet(LS_KEYS.activitiesList, list.filter((a) => a.id !== id))
  await obEnqueue(ENTITY_TYPE, id, 'delete')
  scheduleFlush()
}

registerEntityFlusher(ENTITY_TYPE, (rows) => flushRows(rows, async (row) => {
  if (row.op === 'delete') {
    await apiFetch(`/api/activity?id=${encodeURIComponent(row.recordId)}`, { method: 'DELETE' })
  } else if (row.op === 'upsert') {
    await apiFetch('/api/activity', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(row.payload),
    })
  } else {
    await apiFetch('/api/activity', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: row.recordId, ...(row.payload as object ?? {}) }),
    })
  }
}))

// Keeps this device's cached list/records in sync with edits made on other devices — see
// lib/sync/pullEngine.ts. Sort matches app/api/activities/route.ts's ORDER BY start_time DESC.
registerListReconciler<ActivityMeta, StoredActivity>({
  digestUrl:    '/api/activities?digest=1',
  listCacheKey: LS_KEYS.activitiesList,
  itemCacheKey: LS_KEYS.activity,
  fetchItem:    (id) => apiFetch<StoredActivity>(`/api/activity?id=${encodeURIComponent(id)}`),
  toMeta,
  sort: (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  entityType:   ENTITY_TYPE,
})

/** Global stats calculated from the list (no extra fetch). */
export function computeGlobalStats(activities: ActivityMeta[]) {
  return {
    totalActivities:   activities.length,
    totalDistanceKm:   activities.reduce((s, a) => s + a.distanceMeters / 1000, 0),
    totalTimeSeconds:  activities.reduce((s, a) => s + a.totalTimeSeconds, 0),
    totalCalories:     activities.reduce((s, a) => s + a.calories, 0),
    totalElevationGain: activities.reduce((s, a) => s + a.elevationGain, 0),
    totalDepKm: activities.reduce((s, a) => s + (a.depKm ?? computeDEP(a.distanceMeters, a.elevationGain)), 0),
    avgHeartRate:      activities.length
      ? Math.round(activities.reduce((s, a) => s + a.avgHeartRate, 0) / activities.length)
      : 0,
    longestKm:  activities.length ? Math.max(...activities.map((a) => a.distanceMeters / 1000)) : 0,
    highestAlt: activities.length ? Math.max(...activities.map((a) => a.altitudeMax)) : 0,
  }
}

export { toMeta }
