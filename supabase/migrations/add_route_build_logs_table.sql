-- ═══════════════════════════════════════════════════════════
-- Log delle operazioni del route builder (ricerca + costruzione percorsi), vedi
-- lib/routeBuilder/operationsLog.ts. Non è un log di debug generico: registra, per ogni
-- richiesta, quale livello (tier0/tier1/AI) l'ha risolta, quanti percorsi trovati/costruiti,
-- se è scattato il ritentativo con lunghezze alternative — consultabile dall'utente stesso su
-- /profilo/log-ricerche (app/api/route-build/logs/route.ts), mai da altri utenti (RLS owner-based,
-- stesso pattern di hike_navigation_sessions).
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS route_build_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind                TEXT NOT NULL, -- 'search' | 'build'
  query               TEXT,          -- solo per 'search': il testo digitato dall'utente
  route_type          TEXT,          -- solo per 'build': 'anello' | 'andata_ritorno' | 'solo_andata'
  target_distance_km  NUMERIC,       -- solo per 'build'
  use_ai              BOOLEAN NOT NULL DEFAULT FALSE,
  tier_reached        TEXT NOT NULL, -- es. 'tier0' | 'tier1' | 'built' | 'retry_built' | 'error'
  place_name          TEXT,
  found_count         INTEGER,
  built_count         INTEGER,
  escalated_to_ai     BOOLEAN NOT NULL DEFAULT FALSE,
  retried             BOOLEAN NOT NULL DEFAULT FALSE,
  message             TEXT,
  duration_ms         INTEGER,
  details             JSONB
);

CREATE INDEX IF NOT EXISTS idx_route_build_logs_user ON route_build_logs (user_id, created_at DESC);

ALTER TABLE route_build_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_build_logs_owner" ON route_build_logs;
CREATE POLICY "route_build_logs_owner"
  ON route_build_logs FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
