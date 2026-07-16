'use client'

/**
 * Local-first access to /api/user-settings — pilot entity for the outbox
 * pattern (see lib/sync/syncEngine.ts). Reads are cache-first: the local
 * IndexedDB copy is returned immediately if present, Supabase is only
 * consulted when there is no local copy yet. Writes apply to the local
 * cache instantly and are queued for background sync instead of blocking
 * on the network.
 *
 * Deliberately NOT covered here: the Claude API key (apiKey/hasKey/keyHint)
 * and its DELETE — sensitive, write-only from the client's perspective, kept
 * as a direct network action in components/profilo/SectionClaudeKey.tsx.
 */

import { lsGet, lsSet, LS_KEYS, obEnqueue } from '@/lib/localStore'
import { registerEntityFlusher, scheduleFlush } from './syncEngine'
import { registerPullTask } from './pullEngine'

export interface UserSettingsData {
  hasKey: boolean
  keyHint: string | null
  subscriptionTier: string
  userAge: number
  userWeightKg: number
  userHeightCm: number
  userGender: string
  derivedFCmax: number
  beautyNaturaWeight: number
  beautyPaesaggioWeight: number
  beautyArcheologiaWeight: number
  beautyArchitetturaWeight: number
  beautyInteresseWeight: number
  beautyNaturaCultura: number
  beautyNaturaType: number
  beautyCulturaType: number
  prefSforzo: number
  prefDurata: number
  teiPesoCultura: number
  teiPesoTopografia: number
  teiPesoIdrografia: number
  teiPesoFondo: number
  teiPesoGeodiversita: number
  teiFAntrSensitivity: 'ignora' | 'normale' | 'fastidio'
  hikerFaceDataUrl: string | null
  displayName: string | null
  personalDelta: number | null
  hrHikeCount: number
  hrRest: number | null
  hrMax: number | null
  startingAddress: string | null
  startingLat: number | null
  startingLon: number | null
  guidePendingDays: number
  guideBreveSections: string[]
  hikerExperienceLevel: string | null
  hikerConcerns: string[]
  hikerEnvironmentPrefs: string[]
  onboardingCompletedAt: string | null
  /** Server-side last-modified timestamp — see lib/sync/pullEngine.ts. */
  updatedAt: string | null
  aiUseBiometricData: boolean
  aiUseHistoryData: boolean
}

const ENTITY_TYPE = 'user_settings'
const RECORD_ID    = 'self'
const CACHE_KEY    = LS_KEYS.userSettings

async function fetchFromServer(): Promise<UserSettingsData> {
  const res = await fetch('/api/user-settings')
  if (!res.ok) throw new Error(`/api/user-settings → ${res.status}`)
  return res.json()
}

/** Cache-first read. Only hits Supabase once, the first time there's no local copy at all. */
export async function getUserSettingsCached(): Promise<UserSettingsData | Record<string, never>> {
  const cached = await lsGet<UserSettingsData>(CACHE_KEY)
  if (cached) return cached
  try {
    const fresh = await fetchFromServer()
    await lsSet(CACHE_KEY, fresh)
    return fresh
  } catch {
    return {}
  }
}

/** Forces a refetch from Supabase and refreshes the local cache — used after a flush completes, since some fields (subscriptionTier, derivedFCmax, hasKey) are only ever server-derived. */
export async function refreshUserSettings(): Promise<UserSettingsData | null> {
  try {
    const fresh = await fetchFromServer()
    await lsSet(CACHE_KEY, fresh)
    return fresh
  } catch {
    return null
  }
}

/** Applies a partial update to the local cache immediately and queues it for background sync — never blocks on the network. */
export async function updateUserSettings(patch: Record<string, unknown>): Promise<void> {
  const current = (await lsGet<UserSettingsData>(CACHE_KEY)) ?? ({} as UserSettingsData)
  await lsSet(CACHE_KEY, { ...current, ...patch })
  await obEnqueue(ENTITY_TYPE, RECORD_ID, 'patch', patch)
  scheduleFlush()
}

registerEntityFlusher(ENTITY_TYPE, async (rows) => {
  const merged = rows.reduce<Record<string, unknown>>(
    (acc, r) => ({ ...acc, ...(r.payload as Record<string, unknown> ?? {}) }),
    {},
  )
  if (Object.keys(merged).length === 0) {
    return { succeededIds: rows.map((r) => r.outboxId!) }
  }
  const res = await fetch('/api/user-settings', {
    method:    'POST',
    headers:   { 'Content-Type': 'application/json' },
    body:      JSON.stringify(merged),
    keepalive: true,
  })
  if (!res.ok) return { succeededIds: [] }
  refreshUserSettings().catch(() => {})
  return { succeededIds: rows.map((r) => r.outboxId!) }
})

// A single small row per user — cheap enough to just re-fetch on every pull cycle (app open,
// reconnect, becoming visible) instead of building list/digest machinery for one record. See
// lib/sync/pullEngine.ts.
registerPullTask(async () => { await refreshUserSettings() })
