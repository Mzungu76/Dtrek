// Fase 4 di docs/navigator-orizzonti-roadmap.md — aggregazione condivisa tra la lettura
// pubblica (app/api/trails/completions GET) e il segnale community (lib/trailConditions/
// communitySignals.ts), invece di duplicare la stessa query di conteggio in due posti.
import { supabase } from '@/lib/supabase'
import { filterNoteText } from './moderation'

export interface CompletionsSummary {
  completions30d: number
  completionsTotal: number
  /** Già filtrate (filterNoteText) e limitate — pronte per essere mostrate senza ulteriore elaborazione. */
  notes: string[]
}

const NOTES_RETURNED = 5
const NOTES_SCANNED = 10 // margine sopra NOTES_RETURNED: alcune potrebbero non superare il filtro in rilettura
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function fetchCompletionsSummary(osmRelationId: number): Promise<CompletionsSummary> {
  const since30d = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()

  const [recent, total, notesRes] = await Promise.all([
    supabase.from('trail_completions').select('id', { count: 'exact', head: true })
      .eq('osm_relation_id', osmRelationId).gte('completed_at', since30d),
    supabase.from('trail_completions').select('id', { count: 'exact', head: true })
      .eq('osm_relation_id', osmRelationId),
    supabase.from('trail_completions').select('note')
      .eq('osm_relation_id', osmRelationId).not('note', 'is', null)
      .order('completed_at', { ascending: false }).limit(NOTES_SCANNED),
  ])

  // Ri-filtrate qui, non solo alla scrittura — difesa in profondità (lib/community/moderation.ts).
  const notes = (notesRes.data ?? [])
    .map((row) => row.note as string)
    .filter((note) => filterNoteText(note).ok)
    .slice(0, NOTES_RETURNED)

  return { completions30d: recent.count ?? 0, completionsTotal: total.count ?? 0, notes }
}
