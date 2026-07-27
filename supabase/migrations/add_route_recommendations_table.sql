-- "Percorsi per te" — batch corrente di 5 percorsi consigliati per utente, più il feedback
-- (mi piace/non fa per me) per scheda e la bookkeeping per la cadenza ibrida (settimanale +
-- dopo un'escursione completata), vedi lib/routeBuilder/generateRecommendations.ts.
-- Una sola riga per utente (upsert su user_id), non una riga per scheda: le 5 card e il loro
-- feedback vivono nello stesso record, rigenerato per intero ad ogni ciclo.
-- Esegui nel Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS route_recommendations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ok' | 'empty_no_location' | 'error'
  cards         JSONB NOT NULL DEFAULT '[]',     -- [{id, kind:'built'|'found', data}]
  feedback      JSONB NOT NULL DEFAULT '{}',     -- { [cardId]: { value:'like'|'dislike', at } }
  centroid_lat  DOUBLE PRECISION,
  centroid_lon  DOUBLE PRECISION,
  generated_at  TIMESTAMPTZ,
  dirty         BOOLEAN NOT NULL DEFAULT true,   -- true ⇒ da rigenerare al prossimo giro del cron
  dirty_reason  TEXT,                            -- 'never_generated' | 'new_activity' | 'weekly'
  last_error    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_recommendations_dirty        ON route_recommendations (dirty) WHERE dirty = true;
CREATE INDEX IF NOT EXISTS idx_route_recommendations_generated_at ON route_recommendations (generated_at);

ALTER TABLE route_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_recommendations_owner" ON route_recommendations;
CREATE POLICY "route_recommendations_owner"
  ON route_recommendations FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
