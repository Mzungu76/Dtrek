// Public (unauthenticated) read access to a navigation group's members — Fase 9 di
// docs/navigator-orizzonti-roadmap.md. Stesso principio di lib/liveSharePublic.ts (Fase 1):
// client service-role, token + scadenza come unico controllo d'accesso, nessuna riga
// individuale esposta oltre a quanto serve per disegnare i marker (mai l'user_id).
import { supabase } from './supabase'

export interface PublicGroupMember {
  displayName: string
  lat: number
  lon: number
  accuracyM: number | null
  lastUpdateTs: string
}

export interface PublicGroup {
  groupName: string
  expiresAt: string
  members: PublicGroupMember[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function fetchPublicGroup(token: string): Promise<PublicGroup | null> {
  if (!UUID_RE.test(token)) return null

  const { data: group, error } = await supabase
    .from('hike_navigation_groups')
    .select('id,name,share_token_expires_at')
    .eq('share_token', token).single()
  if (error || !group) return null
  if (new Date(group.share_token_expires_at as string) <= new Date()) return null

  const { data: members } = await supabase
    .from('hike_navigation_group_members')
    .select('display_name,session_id,hike_navigation_sessions(last_live_lat,last_live_lon,last_live_accuracy_m,last_live_ts)')
    .eq('group_id', group.id)

  const publicMembers: PublicGroupMember[] = []
  for (const m of members ?? []) {
    // Supabase-js tipizza le relazioni annidate come array anche per un FK singolo — un solo
    // elemento atteso qui (session_id è UNIQUE su hike_navigation_group_members).
    const session = (Array.isArray(m.hike_navigation_sessions) ? m.hike_navigation_sessions[0] : m.hike_navigation_sessions) as
      { last_live_lat: number | null; last_live_lon: number | null; last_live_accuracy_m: number | null; last_live_ts: string | null } | null
    if (!session?.last_live_lat || !session?.last_live_lon || !session?.last_live_ts) continue
    publicMembers.push({
      displayName: (m.display_name as string) || 'Escursionista',
      lat: session.last_live_lat,
      lon: session.last_live_lon,
      accuracyM: session.last_live_accuracy_m,
      lastUpdateTs: session.last_live_ts,
    })
  }

  return {
    groupName: (group.name as string) || 'Gruppo',
    expiresAt: group.share_token_expires_at as string,
    members: publicMembers,
  }
}
