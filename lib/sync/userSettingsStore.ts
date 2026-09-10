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
import { registerEntityFlusher, scheduleFlush, getPendingRecordIds } from './syncEngine'
import { registerPullTask } from './pullEngine'
import { isStaleSwResponse } from '@/lib/apiFetch'

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
  /** Lunghezza del testo AI per sezione (lib/guideSections.ts's SectionLengthMap) — sempre completa. */
  guideSectionLengths: Record<string, string>
  hikerExperienceLevel: string | null
  hikerConcerns: string[]
  hikerEnvironmentPrefs: string[]
  onboardingCompletedAt: string | null
  /** Indipendente da onboardingCompletedAt — vedi supabase/migrations/add_gift_route_offered_at.sql. */
  giftRouteOfferedAt: string | null
  /** Slug di lib/italianRegions.ts, scelto nell'onboarding (auto o manuale) — null se non ancora
   *  raccolta o se l'utente ha scelto esplicitamente di non specificarla. Vedi
   *  supabase/migrations/add_home_region.sql. */
  homeRegion: string | null
  /** Server-side last-modified timestamp — see lib/sync/pullEngine.ts. */
  updatedAt: string | null
  aiUseBiometricData: boolean
  aiUseHistoryData: boolean
  aiUseWebSearch: boolean
  /** Default per il terzo livello (AI) della risoluzione di un luogo noto nel route builder — vedi
   *  lib/routeBuilder/resolvePlace.ts e components/upload/RouteBuilder.tsx. Sovrascrivibile per
   *  singola ricerca nel wizard, questa è solo la scelta di partenza salvata in profilo. */
  routeBuildAiPlaceSearch: boolean
  /** Ultimo Diario aperto, Fase 11 — null finché l'utente non ha ancora aperto un Sommario. Letto
   *  da app/page.tsx per decidere dove aprire l'app, scritto da DiarioIndexLibro a ogni apertura. */
  lastDiaryId: string | null
}

const ENTITY_TYPE = 'user_settings'
const RECORD_ID    = 'self'
const CACHE_KEY    = LS_KEYS.userSettings

async function fetchFromServer(): Promise<UserSettingsData> {
  const res = await fetch('/api/user-settings')
  if (!res.ok) throw new Error(`/api/user-settings → ${res.status}`)
  // See lib/apiFetch.ts's isStaleSwResponse. Unlike the list entities, this row has no
  // conditional guard at all before overwriting the cache (refreshUserSettings below applies
  // whatever it gets unconditionally, every pull cycle) — a stale response served from the
  // service worker's offline fallback cache would otherwise silently roll back a genuine
  // settings change made moments ago or on another device.
  if (isStaleSwResponse(res)) throw new Error('served from a stale offline cache')
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
    const previous = await lsGet<UserSettingsData>(CACHE_KEY)
    await lsSet(CACHE_KEY, fresh)
    // Same signal lib/sync/pullEngine.ts's list reconcilers fire once they apply a changed
    // record — without it, a settings edit made on another device (or the server-derived fields
    // refreshed after a flush) sits in the cache unnoticed until the next full reload, because
    // getUserSettingsCached() only reads the cache and pages don't otherwise know it changed.
    if (typeof window !== 'undefined' && JSON.stringify(previous) !== JSON.stringify(fresh)) {
      window.dispatchEvent(new CustomEvent('cts-updated'))
    }
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
  if (!res.ok) {
    // DTREK-AUDIT.md P1 #15 — errore reale (non solo "fallito") per lib/localStore.ts's
    // obRecordFailure, stesso principio di flushRows in syncEngine.ts.
    const error = `POST /api/user-settings HTTP ${res.status}`
    return { succeededIds: [], failures: rows.map((r) => ({ outboxId: r.outboxId!, error })) }
  }
  refreshUserSettings().catch(() => {})
  return { succeededIds: rows.map((r) => r.outboxId!) }
})

// A single small row per user — cheap enough to just re-fetch on every pull cycle (app open,
// reconnect, becoming visible) instead of building list/digest machinery for one record. See
// lib/sync/pullEngine.ts.
//
// NON usa refreshUserSettings() direttamente: quella sovrascrive la cache SENZA controllare se
// c'è ancora una scrittura locale in coda per questo record — bug reale osservato in produzione
// (DTREK-AUDIT.md/UX-AUDIT.md): un pull "ambientale" come questo può scattare in qualunque momento
// (l'app torna in primo piano, si riconnette) DENTRO la finestra di debounce di 15s prima che il
// flush parta (o più a lungo, se il flush stesso è in backoff) — se in quella finestra arriva,
// riporta indietro il record ancora vecchio dal server e CANCELLA un campo appena scritto in
// locale (es. gift_route_offered_at marcato subito dopo aver saltato l'onboarding), facendo
// ripresentare il passo di onboarding "da solo" all'utente. getPendingRecordIds è lo stesso
// meccanismo già usato da lib/sync/pullEngine.ts's registerListReconciler per lo stesso motivo
// sulle entità a lista — qui applicato anche a questa, l'unica entità a riga singola. Il flusher
// sopra (riga 156) resta invece SENZA questo controllo di proposito: quando lo chiama sa già che
// il server ha appena ricevuto la sua scrittura, anche se la riga outbox non è ancora stata
// rimossa dalla coda locale (avviene dopo, in syncEngine.ts's flush()) — qui il controllo
// darebbe un falso positivo e salterebbe un refresh legittimo.
registerPullTask(async () => {
  const pending = await getPendingRecordIds(ENTITY_TYPE)
  if (pending.has(RECORD_ID)) return
  await refreshUserSettings()
})
