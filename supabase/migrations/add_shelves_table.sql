-- Libreria + Atlante — Fase 0 di docs/libreria-atlante-piano.md. Uno scaffale è un contenitore
-- fisico di Diari (genitore unico, a differenza delle `labels` che restano libere e multiple):
-- un Diario sta su un solo scaffale alla volta, così il drag & drop nel banner della Libreria
-- non è mai ambiguo ("sposta", non "aggiungi a"). Nessun nome proposto dall'app — stesso
-- principio già in vigore per i Diari ("Nuovo Diario" è un segnaposto, non un suggerimento):
-- il default qui sotto è lo stesso genere di segnaposto neutro.
--
-- Esegui nel Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS shelves (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       TEXT NOT NULL DEFAULT 'Scaffale',
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shelves_user ON shelves (user_id, position);

ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shelves_owner" ON shelves;
CREATE POLICY "shelves_owner"
  ON shelves FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE diaries ADD COLUMN IF NOT EXISTS shelf_id       UUID REFERENCES shelves(id) ON DELETE SET NULL;
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS shelf_position INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_diaries_shelf ON diaries (shelf_id, shelf_position);

-- Backfill: ogni utente con almeno un Diario senza scaffale ne riceve uno, e tutti i suoi Diari
-- "senza scaffale" ci finiscono dentro, in ordine di creazione — genitore unico da subito, mai
-- uno stato transitorio "senza scaffale" da gestire in UI. Idempotente: al secondo giro nessun
-- Diario ha più shelf_id NULL, il ciclo non trova nulla da fare.
DO $$
DECLARE
  u RECORD;
  new_shelf_id UUID;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM diaries WHERE shelf_id IS NULL LOOP
    INSERT INTO shelves (user_id, name, position) VALUES (u.user_id, 'I miei Diari', 0)
    RETURNING id INTO new_shelf_id;

    UPDATE diaries SET shelf_id = new_shelf_id, shelf_position = ord.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS rn
      FROM diaries WHERE user_id = u.user_id AND shelf_id IS NULL
    ) ord
    WHERE diaries.id = ord.id;
  END LOOP;
END $$;
