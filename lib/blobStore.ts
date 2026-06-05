import { TcxActivity, type TrackPoint } from './tcxParser'
import { lsGet, lsSet, lsDel, LS_KEYS } from './localStore'
import type { BeautyScore } from './beautyScore'
import type { CtsConfidence } from './trailScore'

export interface StoredActivity extends TcxActivity {
  userNotes?: string
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
}

export interface ActivityMeta {
  id: string
  title: string
  startTime: string
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
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${url} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

function toMeta(a: StoredActivity): ActivityMeta {
  return {
    id:              a.id,
    title:           a.title ?? a.notes ?? 'Escursione',
    startTime:       a.startTime,
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
    userRating:      a.userRating,
    userRatingNote:  a.userRatingNote,
    soddisfazione:   a.soddisfazione,
    linkedBeautyScore:       a.linkedBeautyScore,
    trailScore:              a.trailScore,
    trailScoreConfidence:    a.trailScoreConfidence,
  }
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function bgRefreshList(fresh: ActivityMeta[]) {
  lsSet(LS_KEYS.activitiesList, fresh).catch(() => {})
}

function bgRefreshActivity(fresh: StoredActivity) {
  lsSet(LS_KEYS.activity(fresh.id), fresh).catch(() => {})
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Stale-while-revalidate: returns local cache immediately (fast offline-first),
 * then fetches fresh data from Supabase in the background.
 */
export async function getAllActivities(onRefresh?: (data: ActivityMeta[]) => void): Promise<ActivityMeta[]> {
  const local = await lsGet<ActivityMeta[]>(LS_KEYS.activitiesList)

  // Start network fetch regardless; update cache in background
  const netFetch = apiFetch<ActivityMeta[]>('/api/activities')
    .then((data) => { bgRefreshList(data); onRefresh?.(data); return data })
    .catch((): ActivityMeta[] => [])

  if (local && local.length > 0) {
    netFetch.catch(() => {})  // keep running silently
    return local
  }
  return netFetch
}

/** Returns cached full activity immediately; refreshes from API in background. */
export async function getActivityById(id: string): Promise<StoredActivity | null> {
  const local = await lsGet<StoredActivity>(LS_KEYS.activity(id))

  const netFetch = apiFetch<StoredActivity>(`/api/activity?id=${encodeURIComponent(id)}`)
    .then((data) => { bgRefreshActivity(data); return data })
    .catch((): null => null)

  if (local) {
    netFetch.catch(() => {})
    return local
  }
  return netFetch
}

/** Saves to Supabase, then writes to local cache and updates list cache. */
export async function saveActivity(activity: StoredActivity): Promise<void> {
  await apiFetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activity),
  })
  // Update local cache (don't await — fire-and-forget)
  lsSet(LS_KEYS.activity(activity.id), activity).catch(() => {})
  lsGet<ActivityMeta[]>(LS_KEYS.activitiesList).then((list) => {
    if (!list) return
    const meta    = toMeta(activity)
    const updated = [meta, ...list.filter((a) => a.id !== activity.id)]
    lsSet(LS_KEYS.activitiesList, updated).catch(() => {})
  }).catch(() => {})
}

/** Patches Supabase, then applies the same patch to local cached copies. */
export async function updateActivityMeta(
  id: string,
  meta: Partial<Pick<StoredActivity, 'title' | 'userNotes' | 'tags' | 'userRating' | 'userRatingNote' | 'linkedPlannedId' | 'soddisfazione' | 'linkedBeautyScore' | 'trailScore' | 'trailScoreConfidence'>>
): Promise<void> {
  // Update local caches optimistically (before API) so scores always persist locally
  lsGet<StoredActivity>(LS_KEYS.activity(id)).then((local) => {
    if (local) lsSet(LS_KEYS.activity(id), { ...local, ...meta }).catch(() => {})
  }).catch(() => {})
  lsGet<ActivityMeta[]>(LS_KEYS.activitiesList).then((list) => {
    if (!list) return
    lsSet(LS_KEYS.activitiesList,
      list.map((a) => a.id === id ? { ...a, ...meta } : a)
    ).catch(() => {})
  }).catch(() => {})
  // Sync to Supabase (may fail if columns not yet migrated — local cache already updated)
  await apiFetch('/api/activity', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...meta }),
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
}

/** Deletes from Supabase, then removes from local cache. */
export async function deleteActivity(id: string): Promise<void> {
  await apiFetch(`/api/activity?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  lsDel(LS_KEYS.activity(id)).catch(() => {})
  lsGet<ActivityMeta[]>(LS_KEYS.activitiesList).then((list) => {
    if (!list) return
    lsSet(LS_KEYS.activitiesList, list.filter((a) => a.id !== id)).catch(() => {})
  }).catch(() => {})
}

/** Global stats calculated from the list (no extra fetch). */
export function computeGlobalStats(activities: ActivityMeta[]) {
  return {
    totalActivities:   activities.length,
    totalDistanceKm:   activities.reduce((s, a) => s + a.distanceMeters / 1000, 0),
    totalTimeSeconds:  activities.reduce((s, a) => s + a.totalTimeSeconds, 0),
    totalCalories:     activities.reduce((s, a) => s + a.calories, 0),
    totalElevationGain: activities.reduce((s, a) => s + a.elevationGain, 0),
    avgHeartRate:      activities.length
      ? Math.round(activities.reduce((s, a) => s + a.avgHeartRate, 0) / activities.length)
      : 0,
    longestKm:  activities.length ? Math.max(...activities.map((a) => a.distanceMeters / 1000)) : 0,
    highestAlt: activities.length ? Math.max(...activities.map((a) => a.altitudeMax)) : 0,
  }
}

export { toMeta }
