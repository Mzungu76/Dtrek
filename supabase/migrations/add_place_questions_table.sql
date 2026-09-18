-- ═══════════════════════════════════════════════════════════
-- "Chiedi a Giulia" su una scheda Borgo/Città o Sito (app/mete/[id]/page.tsx) — stesso identico
-- pattern di guide_questions (già in questo schema, per i Percorsi), qui scoped su
-- dtrek_places.id invece di planned_hikes.id. Una tabella a sé, non una colonna aggiuntiva su
-- guide_questions: quella tabella referenzia planned_hikes con ON DELETE CASCADE, un Sito/Borgo
-- non è (e non deve diventare) una riga lì solo per poter fare una domanda.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS place_questions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id   UUID REFERENCES dtrek_places(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  pertinent  BOOLEAN NOT NULL DEFAULT true,
  sources    JSONB NOT NULL DEFAULT '[]',  -- [{url, title}] citate da Claude in questa risposta
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_place_questions_place_id ON place_questions (place_id, created_at);
CREATE INDEX IF NOT EXISTS idx_place_questions_user_id  ON place_questions (user_id);

ALTER TABLE place_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "place_questions_owner" ON place_questions;
CREATE POLICY "place_questions_owner"
  ON place_questions FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
