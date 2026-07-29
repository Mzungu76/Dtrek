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

// Limite di ricerche salvate per utente — oltre questo numero, la più vecchia viene eliminata
// (FIFO) appena se ne salva una nuova. Tiene l'archivio piccolo e sempre rilevante, invece di
// crescere indefinitamente con `results` interi (traccia/POI/punteggio) per ogni ricerca riuscita.
const MAX_SAVED_SEARCHES = 5

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
    // Non blocca la risposta al client (l'id appena creato serve subito alla pillola globale) né
    // la fa fallire se il pruning va storto — è pulizia accessoria, non parte del salvataggio.
    pruneOldSearches(entry.userId).catch(e => console.error('[searchHistory] pruning fallito:', e))
    return data?.id ?? null
  } catch (e) {
    console.error('[searchHistory] scrittura fallita (non bloccante):', e)
    return null
  }
}

// Elimina le ricerche salvate più vecchie oltre MAX_SAVED_SEARCHES per l'utente — chiamata dopo
// ogni inserimento riuscito, così l'archivio non supera mai il limite.
async function pruneOldSearches(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('route_search_history')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(MAX_SAVED_SEARCHES, 999)
  if (error || !data || data.length === 0) return
  const staleIds = data.map(row => row.id as string)
  await supabase.from('route_search_history').delete().in('id', staleIds)
}
