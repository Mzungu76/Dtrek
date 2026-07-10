import { TcxActivity, type TrackPoint } from './tcxParser'
import { lsGet, lsSet, lsDel, LS_KEYS, obEnqueue } from './localStore'
import { registerEntityFlusher, scheduleFlush } from './sync/syncEngine'
import type { BeautyScore } from './beautyScore'
import type { CtsConfidence } from './trailScore'
import type { WeatherAtHike } from './openmeteo'
import { computeDEP } from './stats'

const ENTITY_TYPE = 'activity'

export interface HikeNote {
  id:        string
  text:      string
  timestamp: string
  lat?:      number
  lon?:      number
  /** Optional photo attached to the note (Supabase Storage public URL) — a note can be text-only, voice-dictated text, a photo, or both. */
  photoUrl?: string
  photoStoragePath?: string
}

export interface StoredActivity extends TcxActivity {
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
  trailScoreComputedAt?: string
  depKm?: number
  iev?: number
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
    trailScoreComputedAt:    a.trailScoreComputedAt,
    depKm:           computeDEP(a.distanceMeters, a.elevationGain),
    iev:             a.iev ?? undefined,  // a.iev is number | null | undefined (TcxActivity)
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
  if (local) return local
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

/** Applies the activity to the local cache immediately and queues it for background sync to Supabase. */
export async function saveActivity(activity: StoredActivity): Promise<void> {
  await lsSet(LS_KEYS.activity(activity.id), activity)
  const list = await lsGet<ActivityMeta[]>(LS_KEYS.activitiesList)
  const meta = toMeta(activity)
  const updated = [meta, ...(list ?? []).filter((a) => a.id !== activity.id)]
  await lsSet(LS_KEYS.activitiesList, updated)
  await obEnqueue(ENTITY_TYPE, activity.id, 'upsert', activity)
  scheduleFlush()
}

/** Applies a partial update to the local cache immediately and queues it for background sync. */
export async function updateActivityMeta(
  id: string,
  meta: Partial<Pick<StoredActivity, 'title' | 'userNotes' | 'hikeNotes' | 'tags' | 'userRating' | 'userRatingNote' | 'linkedPlannedId' | 'soddisfazione' | 'linkedBeautyScore' | 'trailScore' | 'trailScoreConfidence' | 'trailScoreComputedAt'>>
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

registerEntityFlusher(ENTITY_TYPE, async (rows) => {
  const succeededIds: number[] = []
  for (const row of rows) {
    try {
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
      succeededIds.push(row.outboxId!)
    } catch {
      // Leave this row pending — retried on the next flush trigger.
    }
  }
  return { succeededIds }
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
