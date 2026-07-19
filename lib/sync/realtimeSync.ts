'use client'

/**
 * Real-time complement to lib/sync/pullEngine.ts's polling triggers (app open, network
 * reconnect, tab becoming visible, and a 5-minute safety net — see components/
 * SyncEngineProvider.tsx). Those eventually pick up a change made on another device, but on a
 * desktop tab left open and in the foreground the whole time, "eventually" can be up to 5 minutes
 * — too slow for "vedo subito quello che ho appena fatto sul telefono".
 *
 * This subscribes to Supabase Realtime's postgres_changes on the three tables synced locally
 * (lib/blobStore.ts's activities, lib/plannedStore.ts's planned_hikes, lib/sync/
 * userSettingsStore.ts's user_settings) and triggers an immediate pullAll() the moment a row
 * actually changes, instead of waiting for the next polling trigger. supabase-schema.sql's
 * "*_owner" RLS policies (auth.uid() = user_id) already restrict delivery to the signed-in user's
 * own rows — the `user_id=eq.<uid>` filter below is an efficiency narrowing on top of that, not a
 * security boundary on its own.
 *
 * Requires the tables to be added to the `supabase_realtime` publication — see
 * supabase/migrations/enable_realtime_sync_tables.sql. Without that migration applied, this
 * degrades silently to a no-op subscription (no events ever arrive) and the polling triggers above
 * remain the only sync path — never a regression, just slower.
 */

import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { pullAll } from './pullEngine'
import type { RealtimeChannel, AuthChangeEvent, Session } from '@supabase/supabase-js'

const SYNCED_TABLES = ['activities', 'planned_hikes', 'user_settings'] as const

let channel: RealtimeChannel | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRepull() {
  if (debounceTimer) clearTimeout(debounceTimer)
  // A single import/save can touch more than one row (or the outbox flush a whole batch), firing
  // one event per row — coalesce them into a single pullAll() instead of one per row.
  debounceTimer = setTimeout(() => { pullAll() }, 400)
}

function subscribeFor(userId: string) {
  const supabase = getBrowserSupabase()
  let ch = supabase.channel(`dtrek-sync-${userId}`)
  for (const table of SYNCED_TABLES) {
    ch = ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      scheduleRepull,
    )
  }
  ch.subscribe()
  channel = ch
}

function teardown() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
  if (channel) { getBrowserSupabase().removeChannel(channel); channel = null }
}

/**
 * Starts (or restarts) the realtime subscription for whichever user is currently signed in, and
 * keeps it aligned with sign-in/sign-out. Call once per app session — see
 * components/SyncEngineProvider.tsx. Returns a cleanup function.
 */
export function startRealtimeSync(): () => void {
  const supabase = getBrowserSupabase()
  let currentUserId: string | null = null

  const applyUser = (userId: string | null) => {
    if (userId === currentUserId) return
    teardown()
    currentUserId = userId
    if (userId) subscribeFor(userId)
  }

  supabase.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => applyUser(data.user?.id ?? null)).catch(() => {})
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
    applyUser(session?.user?.id ?? null)
  })

  return () => {
    subscription.unsubscribe()
    teardown()
  }
}
