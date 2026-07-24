-- Cache Supabase per la rete cammini OSM (lib/routeBuilder/osmGraph.ts's fetchWalkNetwork) —
-- stesso pattern di dtm_cache (vedi lib/dtm/dtmCache.ts), finora l'unica cache mancante nella
-- pipeline "Su misura": ogni generazione (dal wizard o dal cron di Percorsi per te) riscaricava da
-- zero l'intera rete percorribile del bbox, anche per richieste ripetute nella stessa zona — il
-- passo più pesante dell'intera generazione, causa dominante dei timeout osservati in produzione.
-- Dato di riferimento condiviso (non per-utente, niente user_id): la rete cammini non dipende da
-- chi genera, solo dal bbox.
-- Esegui nel Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS walk_network_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  network       jsonb,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_walk_network_cache_expires_at ON walk_network_cache (expires_at);

ALTER TABLE walk_network_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walk_network_cache_public_read" ON walk_network_cache;
CREATE POLICY "walk_network_cache_public_read" ON walk_network_cache FOR SELECT USING (true);
