-- Cache Supabase per il classificatore "probabilità escursionistica" (lib/routeBuilder/
-- hikingProbability.ts) — stesso identico pattern di walk_network_cache (vedi
-- add_walk_network_cache_table.sql): senza questa cache, ogni ricerca "Esistenti" che finisce nel
-- ripiego "probabilità" riscaricava da zero 3 chiamate Overpass (rete + relation + aree
-- protette/centri abitati) per lo stesso bbox, anche per richieste ripetute nella stessa zona —
-- causa osservata in produzione di ripetuti timeout a 45s. Dato di riferimento condiviso (non
-- per-utente, niente user_id): dipende solo dal bbox.
-- Esegui nel Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS hiking_probability_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  data          jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hiking_probability_cache_expires_at ON hiking_probability_cache (expires_at);

ALTER TABLE hiking_probability_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hiking_probability_cache_public_read" ON hiking_probability_cache;
CREATE POLICY "hiking_probability_cache_public_read" ON hiking_probability_cache FOR SELECT USING (true);
