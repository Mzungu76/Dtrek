import { TcxActivity } from './tcxParser'

const STORAGE_KEY = 'trekking_diary_activities'

export interface StoredActivity extends TcxActivity {
  userNotes?: string
  title?: string
  tags?: string[]
  coverColor?: string
  fileName?: string
}

export function getAllActivities(): StoredActivity[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StoredActivity[]
  } catch {
    return []
  }
}

export function saveActivity(activity: StoredActivity): void {
  const all = getAllActivities()
  const idx = all.findIndex(a => a.id === activity.id)
  if (idx >= 0) {
    all[idx] = activity
  } else {
    all.unshift(activity)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function getActivityById(id: string): StoredActivity | null {
  const all = getAllActivities()
  return all.find(a => a.id === id) ?? null
}

export function deleteActivity(id: string): void {
  const all = getAllActivities().filter(a => a.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function updateActivityMeta(
  id: string,
  meta: Partial<Pick<StoredActivity, 'title' | 'userNotes' | 'tags'>>
): void {
  const all = getAllActivities()
  const idx = all.findIndex(a => a.id === id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...meta }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  }
}

export function getGlobalStats() {
  const all = getAllActivities()
  return {
    totalActivities: all.length,
    totalDistanceKm: all.reduce((s, a) => s + a.distanceMeters / 1000, 0),
    totalTimeSeconds: all.reduce((s, a) => s + a.totalTimeSeconds, 0),
    totalCalories: all.reduce((s, a) => s + a.calories, 0),
    totalElevationGain: all.reduce((s, a) => s + a.elevationGain, 0),
    avgHeartRate: all.length
      ? Math.round(all.reduce((s, a) => s + a.avgHeartRate, 0) / all.length)
      : 0,
    longestKm: all.length ? Math.max(...all.map(a => a.distanceMeters / 1000)) : 0,
    highestAlt: all.length ? Math.max(...all.map(a => a.altitudeMax)) : 0,
  }
}
