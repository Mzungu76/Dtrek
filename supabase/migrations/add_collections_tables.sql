-- Raccolte pubblicabili — docs/raccolte-pubblicazione-piano.md, Fase 3a. Una raccolta è una
-- SELEZIONE ORDINATA di Diari, non una cartella: un Diario può stare in più raccolte (o in
-- nessuna) e non smette di esistere per conto proprio quando ne entra in una — vedi il confronto
-- con le raccolte-come-cartelle in docs/mockup-diari-redesign/README.md.
--
-- Esegui nel Supabase SQL Editor PRIMA di deployare il codice che le usa (idempotente, come le
-- altre) — la Fase 0 di questo stesso restyling ha già insegnato cosa succede al contrario: un
-- 500 su ogni richiesta finché qualcuno non se ne accorge.

CREATE TABLE IF NOT EXISTS collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Nuova raccolta',
  subtitle    TEXT NOT NULL DEFAULT '',
  -- Markdown breve — la "prefazione" del mockup PubRaccolta.dc.html, non un intero racconto.
  preface     TEXT NOT NULL DEFAULT '',
  cover_url   TEXT,
  share_token UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections (user_id);

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collections_owner" ON collections;
CREATE POLICY "collections_owner"
  ON collections FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Lettura pubblica per link di condivisione — stessa policy "cintura e bretelle" già su `diaries`
-- (la vera guardia è il token opaco, letto lato server col client service-role che scavalca la
-- RLS comunque; questa policy copre un eventuale accesso diretto via client anon/authenticated).
DROP POLICY IF EXISTS "collections_public_share" ON collections;
CREATE POLICY "collections_public_share"
  ON collections FOR SELECT
  USING (share_token IS NOT NULL);

-- Giunzione Raccolta↔Diario, con l'ordine di lettura (`position`) esplicito invece che dedotto
-- dall'ordine di inserimento — un riordino è un semplice re-write delle posizioni, non un
-- DELETE+INSERT che perderebbe la riga in caso di errore a metà.
CREATE TABLE IF NOT EXISTS collection_diaries (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE NOT NULL,
  diary_id      UUID REFERENCES diaries(id)     ON DELETE CASCADE NOT NULL,
  -- Denormalizzato apposta: fa funzionare la stessa policy `auth.uid() = user_id` di ogni altra
  -- tabella invece di un EXISTS sulla raccolta genitore a ogni riga.
  user_id       UUID REFERENCES auth.users(id)  ON DELETE CASCADE NOT NULL,
  position      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, diary_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_diaries_collection ON collection_diaries (collection_id, position);
CREATE INDEX IF NOT EXISTS idx_collection_diaries_diary ON collection_diaries (diary_id);

ALTER TABLE collection_diaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "collection_diaries_owner" ON collection_diaries;
CREATE POLICY "collection_diaries_owner"
  ON collection_diaries FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "collection_diaries_public_share" ON collection_diaries;
CREATE POLICY "collection_diaries_public_share"
  ON collection_diaries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM collections c WHERE c.id = collection_diaries.collection_id AND c.share_token IS NOT NULL
  ));
