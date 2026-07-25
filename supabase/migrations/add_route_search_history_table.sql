-- ═══════════════════════════════════════════════════════════
-- Storico delle ricerche del route builder (vedi lib/routeBuilder/searchHistory.ts), consultabile
-- dall'utente su /profilo/ricerche-salvate (elenco) e /profilo/ricerche-salvate/[id] (dettaglio).
-- A differenza di route_build_logs (diagnostica tecnica, righe leggere) qui si salva il risultato
-- COMPLETO di una ricerca riuscita — `results` contiene l'intero elenco di ResultItem (percorsi
-- trovati o costruiti, con traccia reale, POI e punteggio provvisorio già inclusi) così il
-- dettaglio può ri-renderizzarlo con le stesse card della ricerca originale senza rifare nessuna
-- chiamata Overpass/DTM. RLS owner-based, stesso pattern di route_build_logs.
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS route_search_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode          TEXT NOT NULL,          -- 'esistenti' | 'su_misura'
  query         TEXT,                   -- luogo/testo cercato, per l'etichetta nell'elenco
  place_name    TEXT,                   -- nome risolto del luogo di partenza, se noto
  result_count  INTEGER NOT NULL DEFAULT 0,
  params        JSONB NOT NULL DEFAULT '{}',  -- parametri della ricerca (raggio, tipo, lunghezza, destinazione, preferenze...)
  results       JSONB NOT NULL DEFAULT '[]'   -- ResultItem[] completo — nessun ricalcolo alla visione
);

CREATE INDEX IF NOT EXISTS idx_route_search_history_user ON route_search_history (user_id, created_at DESC);

ALTER TABLE route_search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_search_history_owner" ON route_search_history;
CREATE POLICY "route_search_history_owner"
  ON route_search_history FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
