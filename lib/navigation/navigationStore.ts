/**
 * Local (IndexedDB-backed) source of truth for an in-progress navigation
 * session. During a hike the app is frequently offline, so this — not
 * Supabase's hike_navigation_events — is what survives a page refresh:
 * current smoothed position, bearing history, which POIs/moments have
 * already been announced, and the current nav state.
 */
import { lsGet, lsSet, lsDel } from '@/lib/localStore'
import type { GeoFix, NavState } from './types'

export interface NavigationSessionSnapshot {
  hikeId: string
  sessionId: string
  startedAt: number
  state: NavState
  lastFix: GeoFix | null
  lastBearingDeg: number | null
  notifiedPoiIds: (string | number)[]
  reachedMomentIds: string[]
}

const NAV_SESSION_KEY = (hikeId: string) => `nav-session:${hikeId}`

export async function loadNavigationSession(hikeId: string): Promise<NavigationSessionSnapshot | null> {
  return lsGet<NavigationSessionSnapshot>(NAV_SESSION_KEY(hikeId))
}

export async function saveNavigationSession(snapshot: NavigationSessionSnapshot): Promise<void> {
  await lsSet(NAV_SESSION_KEY(snapshot.hikeId), snapshot)
}

export async function clearNavigationSession(hikeId: string): Promise<void> {
  await lsDel(NAV_SESSION_KEY(hikeId))
}

export function newSessionSnapshot(hikeId: string, sessionId: string): NavigationSessionSnapshot {
  return {
    hikeId,
    sessionId,
    startedAt: Date.now(),
    state: 'idle',
    lastFix: null,
    lastBearingDeg: null,
    notifiedPoiIds: [],
    reachedMomentIds: [],
  }
}

// ── Offline track queue: fixes buffered locally, flushed to hike_navigation_track when back online ──

const TRACK_QUEUE_KEY = (sessionId: string) => `nav-track-queue:${sessionId}`

export interface QueuedTrackFix {
  ts: number
  lat: number
  lon: number
  altitudeM?: number | null
  speedMs?: number | null
  accuracyM?: number | null
}

export async function queueTrackFix(sessionId: string, fix: QueuedTrackFix): Promise<void> {
  const existing = (await lsGet<QueuedTrackFix[]>(TRACK_QUEUE_KEY(sessionId))) ?? []
  existing.push(fix)
  await lsSet(TRACK_QUEUE_KEY(sessionId), existing)
}

export async function drainTrackQueue(sessionId: string): Promise<QueuedTrackFix[]> {
  const existing = (await lsGet<QueuedTrackFix[]>(TRACK_QUEUE_KEY(sessionId))) ?? []
  await lsDel(TRACK_QUEUE_KEY(sessionId))
  return existing
}
