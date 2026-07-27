// Persistenza di una ricerca completa (vedi supabase/migrations/add_route_search_history_table.sql)
// — a differenza di operationsLog.ts (diagnostica tecnica), qui si salva il risultato intero
// (l'elenco di ResultItem, con traccia reale/POI/punteggio già inclusi) così /profilo/ricerche-salvate
// può ri-mostrarlo in seguito senza rifare nessuna ricerca. Scrittura best-effort, come
// operationsLog.ts: un fallimento qui non deve mai bloccare la ricerca stessa.
//
// SERVER-ONLY: importa lib/supabase (service role) — non importare da un componente client.
import { supabase } from '@/lib/supabase'

export interface SearchHistoryEntry {
  userId: string
  mode: 'esistenti' | 'su_misura'
  query?: string | null
  placeName?: string | null
  params: Record<string, unknown>
  results: unknown[]
}

// Ritorna l'id della riga creata (null se il salvataggio fallisce o non c'è nulla da salvare) — usato
// dal client per collegare l'indicatore globale di ricerca in background (vedi
// lib/routeBuilder/backgroundSearchStore.ts) direttamente al dettaglio appena creato.
export async function saveSearchHistoryEntry(entry: SearchHistoryEntry): Promise<string | null> {
  if (entry.results.length === 0) return null
  try {
    const { data, error } = await supabase.from('route_search_history').insert({
      user_id: entry.userId,
      mode: entry.mode,
      query: entry.query ?? null,
      place_name: entry.placeName ?? null,
      result_count: entry.results.length,
      params: entry.params,
      results: entry.results,
    }).select('id').single()
    if (error) {
      console.error('[searchHistory] insert fallito:', error.message)
      return null
    }
    return data?.id ?? null
  } catch (e) {
    console.error('[searchHistory] scrittura fallita (non bloccante):', e)
    return null
  }
}
