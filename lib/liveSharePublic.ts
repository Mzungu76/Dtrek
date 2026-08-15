// Public (unauthenticated) read access to a live navigation session's last known position.
// Mirrors lib/sharePublic.ts's pattern: the service-role client bypasses RLS, access is gated
// solely by an unguessable share_token AND its expiry — never eternal, see
// supabase/migrations/add_navigation_live_share.sql. Returns a curated, privacy-safe subset.

import { supabase } from './supabase'

export interface PublicLiveSession {
  hikeTitle: string
  lat: number
  lon: number
  accuracyM: number | null
  lastUpdateTs: string
  expiresAt: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function fetchLiveSession(token: string): Promise<PublicLiveSession | null> {
  if (!UUID_RE.test(token)) return null

  const { data, error } = await supabase
    .from('hike_navigation_sessions')
    .select('last_live_lat,last_live_lon,last_live_accuracy_m,last_live_ts,share_token_expires_at,planned_hike_id')
    .eq('share_token', token)
    .single()

  if (error || !data) return null
  if (!data.share_token_expires_at || new Date(data.share_token_expires_at as string) <= new Date()) return null
  if (data.last_live_lat == null || data.last_live_lon == null || !data.last_live_ts) return null

  let hikeTitle = 'Escursione'
  if (data.planned_hike_id) {
    const { data: hike } = await supabase
      .from('planned_hikes').select('title').eq('id', data.planned_hike_id as string).single()
    if (hike?.title) hikeTitle = hike.title as string
  }

  return {
    hikeTitle,
    lat: data.last_live_lat as number,
    lon: data.last_live_lon as number,
    accuracyM: (data.last_live_accuracy_m as number) ?? null,
    lastUpdateTs: data.last_live_ts as string,
    expiresAt: data.share_token_expires_at as string,
  }
}
