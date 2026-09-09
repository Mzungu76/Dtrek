-- Fonde gli Scaffali dentro le Raccolte — richiesta esplicita dell'utente: sono la stessa cosa
-- ("gli scaffali non sono altro che le precedenti Raccolte, raggruppano cioè più Diari"),
-- rappresentata diversamente a seconda di dove la si guarda (il banner della Libreria per
-- organizzare, /raccolte/[id] per comporre e pubblicare). Un Diario sta però su UN SOLO scaffale
-- alla volta (vincolo esplicito dell'utente, diverso dalla raccolta pubblicabile pre-esistente,
-- che poteva contenere lo stesso Diario più volte in raccolte diverse) — imposto qui con un
-- UNIQUE su collection_diaries.diary_id.
--
-- Esegui nel Supabase SQL Editor DOPO aver letto le note in fondo: questa migration è distruttiva
-- (droppa `shelves` e le colonne `diaries.shelf_id`/`shelf_position`) — a differenza delle altre
-- migration di questo repo, non va lanciata automaticamente senza conferma.

-- 1. Le Raccolte hanno bisogno di un ordine proprio (prima erano poche, mostrate senza un ordine
--    scelto dall'utente — gli Scaffali invece si riordinano, o almeno lo faranno).
ALTER TABLE collections ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;

-- 2. Ogni scaffale esistente diventa una raccolta — stesso nome, stessa posizione. Idempotente:
--    salta gli utenti che hanno già una raccolta con lo stesso titolo E la stessa posizione creata
--    da questo stesso passo (riconoscibile perché nasce con preface/subtitle vuoti e senza
--    share_token — la firma di una raccolta mai composta a mano).
DO $$
DECLARE
  s RECORD;
  new_collection_id UUID;
BEGIN
  FOR s IN SELECT * FROM shelves LOOP
    IF NOT EXISTS (
      SELECT 1 FROM collections
      WHERE user_id = s.user_id AND title = s.name AND position = s.position
        AND share_token IS NULL AND subtitle = '' AND preface = ''
    ) THEN
      INSERT INTO collections (user_id, title, subtitle, preface, position)
      VALUES (s.user_id, s.name, '', '', s.position)
      RETURNING id INTO new_collection_id;

      -- 3. I Diari di questo scaffale entrano in collection_diaries, nello stesso ordine.
      INSERT INTO collection_diaries (collection_id, diary_id, user_id, position)
      SELECT new_collection_id, d.id, d.user_id, d.shelf_position
      FROM diaries d
      WHERE d.shelf_id = s.id;
    END IF;
  END LOOP;
END $$;

-- 4. Backfill di sicurezza: un Diario che per qualsiasi motivo non è finito in nessuna
--    collection_diaries (shelf_id già NULL prima di questa migration, o mai passato dal backfill
--    di add_shelves_table.sql) riceve una raccolta tutta sua — stesso principio "mai uno stato
--    transitorio senza scaffale" del backfill originale.
DO $$
DECLARE
  d RECORD;
  new_collection_id UUID;
BEGIN
  FOR d IN
    SELECT diaries.* FROM diaries
    LEFT JOIN collection_diaries cd ON cd.diary_id = diaries.id
    WHERE cd.diary_id IS NULL
  LOOP
    INSERT INTO collections (user_id, title, subtitle, preface, position)
    VALUES (d.user_id, 'I miei Diari', '', '', 0)
    RETURNING id INTO new_collection_id;

    INSERT INTO collection_diaries (collection_id, diary_id, user_id, position)
    VALUES (new_collection_id, d.id, d.user_id, 0);
  END LOOP;
END $$;

-- 5. Un Diario su un solo scaffale: se lo stesso diary_id compare in più righe (poteva succedere
--    solo per una raccolta pubblicabile composta a mano prima di questa fusione), tiene solo la
--    prima (posizione più bassa, poi raccolta più vecchia) e scarta le altre.
DELETE FROM collection_diaries cd
WHERE cd.ctid NOT IN (
  SELECT DISTINCT ON (cd2.diary_id) cd2.ctid
  FROM collection_diaries cd2
  JOIN collections c ON c.id = cd2.collection_id
  ORDER BY cd2.diary_id, cd2.position ASC, c.created_at ASC
);

ALTER TABLE collection_diaries ADD CONSTRAINT collection_diaries_diary_unique UNIQUE (diary_id);

-- 6. Le colonne vecchie e la tabella vecchia non servono più: tutto ciò che leggevano ora vive in
--    collection_diaries.
ALTER TABLE diaries DROP COLUMN IF EXISTS shelf_id;
ALTER TABLE diaries DROP COLUMN IF EXISTS shelf_position;
DROP TABLE IF EXISTS shelves;

-- Da eseguire SEMPRE dopo un ALTER TABLE/DROP TABLE su una tabella già in uso (vedi
-- reload_postgrest_schema_cache.sql): senza questo, PostgREST continua a servire lo schema
-- vecchio e ogni query che referenzia le colonne appena tolte/aggiunte fallisce con PGRST204/500
-- finché la cache non si ricarica da sola.
NOTIFY pgrst, 'reload schema';
