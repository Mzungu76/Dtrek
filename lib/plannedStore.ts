import type { TrackPoint } from './tcxParser'
import type { HikeAssessment } from './hikeAssessment'
import { lsGet, lsSet, lsDel, LS_KEYS } from './localStore'
import type { BeautyScore } from './beautyScore'
import type { CtsConfidence } from './trailScore'
import type { SafetyScore } from './safetyScore'

export type { HikeAssessment, AssessmentItem } from './hikeAssessment'

export interface PlannedHike {
  id: string
  title: string
  plannedDate?: string
  fileName?: string
  userNotes?: string
  tags?: string[]
  createdAt: string
  distanceMeters:       number
  elevationGain:        number
  elevationLoss:        number
  altitudeMax:          number
  altitudeMin:          number
  estimatedTimeSeconds: number
  routePolyline?:       [number, number][]
  trackPoints?:         TrackPoint[]
  assessment?:          HikeAssessment
  cachedPois?:          unknown[]
  cachedPoiWiki?:       unknown[]
  cachedGuide?:         string
  cachedBeautyScore?:            BeautyScore
  cachedTrailScore?:             number
  cachedTrailScoreConfidence?:   CtsConfidence
  cachedSafetyScore?:            SafetyScore
}

// Index entry — no trackPoints (kept lightweight for the list)
export type PlannedHikeMeta = Omit<PlannedHike, 'trackPoints'>

// ── helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${url} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

function toPlannedMeta(h: PlannedHike): PlannedHikeMeta {
  const { trackPoints: _, ...meta } = h
  return meta
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Stale-while-revalidate: local cache → Supabase refresh in background. */
export async function getAllPlanned(onRefresh?: (data: PlannedHikeMeta[]) => void): Promise<PlannedHikeMeta[]> {
  const local = await lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList)

  const netFetch = apiFetch<PlannedHikeMeta[]>('/api/planned')
    .then((data) => { lsSet(LS_KEYS.plannedList, data).catch(() => {}); onRefresh?.(data); return data })
    .catch((): PlannedHikeMeta[] => [])

  if (local && local.length > 0) {
    netFetch.catch(() => {})
    return local
  }
  return netFetch
}

/** Returns cached full planned hike immediately; refreshes from API in background. */
export async function getPlannedById(id: string): Promise<PlannedHike | null> {
  const local = await lsGet<PlannedHike>(LS_KEYS.planned(id))

  const netFetch = apiFetch<PlannedHike>(`/api/planned?id=${encodeURIComponent(id)}`)
    .then((data) => { lsSet(LS_KEYS.planned(id), data).catch(() => {}); return data })
    .catch((): null => null)

  if (local) {
    netFetch.catch(() => {})
    return local
  }
  return netFetch
}

/** Saves to Supabase, then updates local cache. */
export async function savePlanned(hike: PlannedHike): Promise<{ assessment?: HikeAssessment }> {
  const result = await apiFetch<{ ok: boolean; assessment?: HikeAssessment }>('/api/planned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hike),
  })
  // Update local cache
  lsSet(LS_KEYS.planned(hike.id), hike).catch(() => {})
  lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList).then((list) => {
    const meta    = toPlannedMeta(hike)
    const updated = [meta, ...(list ?? []).filter((h) => h.id !== hike.id)]
    lsSet(LS_KEYS.plannedList, updated).catch(() => {})
  }).catch(() => {})
  return result
}

/** Patches Supabase, then applies same patch to local cached copies. */
export async function updatePlannedMeta(
  id: string,
  meta: Partial<Pick<PlannedHike, 'title' | 'userNotes' | 'tags' | 'plannedDate' | 'cachedPois' | 'cachedPoiWiki' | 'cachedGuide' | 'cachedBeautyScore' | 'cachedTrailScore' | 'cachedTrailScoreConfidence' | 'cachedSafetyScore'>>,
): Promise<void> {
  // Optimistic IDB update before API call (completes in ~5ms, long before API returns)
  lsGet<PlannedHike>(LS_KEYS.planned(id)).then((local) => {
    if (local) lsSet(LS_KEYS.planned(id), { ...local, ...meta }).catch(() => {})
  }).catch(() => {})
  lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList).then((list) => {
    if (!list) return
    lsSet(LS_KEYS.plannedList,
      list.map((h) => h.id === id ? { ...h, ...meta } : h)
    ).catch(() => {})
  }).catch(() => {})
  await apiFetch('/api/planned', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...meta }),
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cts-updated'))
}

/** Deletes from Supabase, then removes from local cache. */
export async function deletePlanned(id: string): Promise<void> {
  await apiFetch(`/api/planned?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  lsDel(LS_KEYS.planned(id)).catch(() => {})
  lsGet<PlannedHikeMeta[]>(LS_KEYS.plannedList).then((list) => {
    if (!list) return
    lsSet(LS_KEYS.plannedList, list.filter((h) => h.id !== id)).catch(() => {})
  }).catch(() => {})
}
