-- Stesso blocco anche in supabase-schema.sql
-- Cronologia delle domande poste a Giulia all'interno di un percorso ("Chiedi a Giulia", vedi
-- app/api/guide/qa/route.ts) — una riga per domanda/risposta, non un array JSONB su planned_hikes,
-- così la history cresce senza dover riscrivere l'intera riga del percorso ad ogni domanda.
CREATE TABLE IF NOT EXISTS guide_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_hike_id TEXT REFERENCES planned_hikes(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  pertinent       BOOLEAN NOT NULL DEFAULT true,
  sources         JSONB NOT NULL DEFAULT '[]',  -- [{url, title}] citate da Claude in questa risposta
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guide_questions_planned_hike ON guide_questions (planned_hike_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guide_questions_user_id      ON guide_questions (user_id);

ALTER TABLE guide_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guide_questions_owner" ON guide_questions;
CREATE POLICY "guide_questions_owner"
  ON guide_questions FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
