/**
 * blobStore.ts
 * Sostituisce lib/store.ts.
 * Tutte le operazioni passano per le API Routes Next.js,
 * che a loro volta usano @vercel/blob server-side.
 *
 * Struttura blob:
 *   activities/index.json        → array di ActivityMeta (lista leggera)
 *   activities/{encodedId}.json  → StoredActivity completo
 */

import { TcxActivity, type TrackPoint } from './tcxParser'

export interface StoredActivity extends TcxActivity {
  userNotes?: string
  title?: string
  tags?: string[]
  fileName?: string
  userRating?: number          // 1-10, assegnato dall'utente post-escursione
  userRatingNote?: string      // commento libero
  linkedPlannedId?: string     // ID percorso pianificato di origine
  linkedPlannedTrackPoints?: TrackPoint[]  // tracciato GPS del percorso pianificato
  linkedBeautyScore?: { overall: number; grade: string; color: string }
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
  linkedBeautyScore?: { overall: number; grade: string; color: string }
}

// ── helpers ──────────────────────────────────────────────────────────────────

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
    id: a.id,
    title: a.title ?? a.notes ?? 'Escursione',
    startTime: a.startTime,
    distanceMeters: a.distanceMeters,
    totalTimeSeconds: a.totalTimeSeconds,
    calories: a.calories,
    avgHeartRate: a.avgHeartRate,
    maxHeartRate: a.maxHeartRate,
    elevationGain: a.elevationGain,
    elevationLoss: a.elevationLoss,
    altitudeMax: a.altitudeMax,
    avgSpeedMs: a.avgSpeedMs,
    maxSpeedMs: a.maxSpeedMs,
    tags: a.tags,
    userNotes: a.userNotes,
    fileName: a.fileName,
    userRating: a.userRating,
    userRatingNote: a.userRatingNote,
    linkedBeautyScore: a.linkedBeautyScore,
  }
}

// ── API pubbliche ─────────────────────────────────────────────────────────────

/** Recupera la lista leggera di tutte le escursioni */
export async function getAllActivities(): Promise<ActivityMeta[]> {
  try {
    return await apiFetch<ActivityMeta[]>('/api/activities')
  } catch {
    return []
  }
}

/** Recupera un'escursione completa per ID */
export async function getActivityById(id: string): Promise<StoredActivity | null> {
  try {
    return await apiFetch<StoredActivity>(
      `/api/activity?id=${encodeURIComponent(id)}`
    )
  } catch {
    return null
  }
}

/** Salva una nuova escursione (o sovrascrive se stessa ID) */
export async function saveActivity(activity: StoredActivity): Promise<void> {
  await apiFetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(activity),
  })
}

/** Aggiorna metadati editabili */
export async function updateActivityMeta(
  id: string,
  meta: Partial<Pick<StoredActivity, 'title' | 'userNotes' | 'tags' | 'userRating' | 'userRatingNote' | 'linkedPlannedId' | 'linkedBeautyScore'>>
): Promise<void> {
  await apiFetch('/api/activity', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...meta }),
  })
}

/** Elimina un'escursione */
export async function deleteActivity(id: string): Promise<void> {
  await apiFetch(`/api/activity?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** Statistiche globali calcolate dalla lista */
export function computeGlobalStats(activities: ActivityMeta[]) {
  return {
    totalActivities: activities.length,
    totalDistanceKm: activities.reduce((s, a) => s + a.distanceMeters / 1000, 0),
    totalTimeSeconds: activities.reduce((s, a) => s + a.totalTimeSeconds, 0),
    totalCalories: activities.reduce((s, a) => s + a.calories, 0),
    totalElevationGain: activities.reduce((s, a) => s + a.elevationGain, 0),
    avgHeartRate: activities.length
      ? Math.round(activities.reduce((s, a) => s + a.avgHeartRate, 0) / activities.length)
      : 0,
    longestKm: activities.length ? Math.max(...activities.map(a => a.distanceMeters / 1000)) : 0,
    highestAlt: activities.length ? Math.max(...activities.map(a => a.altitudeMax)) : 0,
  }
}

export { toMeta }
