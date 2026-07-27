// Registra ogni ricerca/costruzione del route builder in route_build_logs (vedi supabase/migrations/
// add_route_build_logs_table.sql) — consultabile dall'utente stesso su /profilo/log-ricerche
// (app/api/route-build/logs/route.ts), mai da altri utenti (RLS owner-based). Scrittura
// best-effort: un fallimento qui non deve mai far fallire la ricerca/costruzione vera e propria,
// solo lasciare quella singola operazione senza voce di log.
import { supabase } from '@/lib/supabase'

export interface RouteBuildLogEntry {
  userId: string | null
  kind: 'search' | 'build'
  query?: string | null
  routeType?: string | null
  targetDistanceKm?: number | null
  useAi: boolean
  tierReached: string
  placeName?: string | null
  foundCount?: number | null
  builtCount?: number | null
  escalatedToAi?: boolean
  retried?: boolean
  message?: string | null
  durationMs: number
  details?: Record<string, unknown> | null
}

export async function logRouteBuildEvent(entry: RouteBuildLogEntry): Promise<void> {
  // Nessun utente autenticato (modalità degradata) — niente riga da associare, salta silenziosamente.
  if (!entry.userId) return
  try {
    const { error } = await supabase.from('route_build_logs').insert({
      user_id: entry.userId,
      kind: entry.kind,
      query: entry.query ?? null,
      route_type: entry.routeType ?? null,
      target_distance_km: entry.targetDistanceKm ?? null,
      use_ai: entry.useAi,
      tier_reached: entry.tierReached,
      place_name: entry.placeName ?? null,
      found_count: entry.foundCount ?? null,
      built_count: entry.builtCount ?? null,
      escalated_to_ai: entry.escalatedToAi ?? false,
      retried: entry.retried ?? false,
      message: entry.message ?? null,
      duration_ms: entry.durationMs,
      details: entry.details ?? null,
    })
    if (error) console.error('[operationsLog] insert fallito:', error.message)
  } catch (e) {
    console.error('[operationsLog] scrittura log fallita (non bloccante):', e)
  }
}
