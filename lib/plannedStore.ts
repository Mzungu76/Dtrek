import type { TrackPoint } from './tcxParser'
import type { HikeAssessment } from './hikeAssessment'

export type { HikeAssessment, AssessmentItem } from './hikeAssessment'

export interface PlannedHike {
  id: string
  title: string
  plannedDate?: string        // ISO date string (user-settable)
  fileName?: string
  userNotes?: string
  tags?: string[]
  createdAt: string
  // from GPX parsing
  distanceMeters:       number
  elevationGain:        number
  elevationLoss:        number
  altitudeMax:          number
  altitudeMin:          number
  estimatedTimeSeconds: number
  routePolyline?:       [number, number][]
  trackPoints?:         TrackPoint[]
  // assessment
  assessment?: HikeAssessment
  // beauty score (cached after first detail-page visit)
  cachedBeautyScore?: { overall: number; grade: string; color: string }
}

// Index entry — no trackPoints (kept lightweight for the list)
export type PlannedHikeMeta = Omit<PlannedHike, 'trackPoints'>

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${url} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export async function getAllPlanned(): Promise<PlannedHikeMeta[]> {
  try { return await apiFetch<PlannedHikeMeta[]>('/api/planned') }
  catch { return [] }
}

export async function getPlannedById(id: string): Promise<PlannedHike | null> {
  try { return await apiFetch<PlannedHike>(`/api/planned?id=${encodeURIComponent(id)}`) }
  catch { return null }
}

export async function savePlanned(hike: PlannedHike): Promise<{ assessment?: HikeAssessment }> {
  return apiFetch<{ ok: boolean; assessment?: HikeAssessment }>('/api/planned', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hike),
  })
}

export async function updatePlannedMeta(
  id: string,
  meta: Partial<Pick<PlannedHike, 'title' | 'userNotes' | 'tags' | 'plannedDate' | 'cachedBeautyScore'>>,
): Promise<void> {
  await apiFetch('/api/planned', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...meta }),
  })
}

export async function deletePlanned(id: string): Promise<void> {
  await apiFetch(`/api/planned?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
