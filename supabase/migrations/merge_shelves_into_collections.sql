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
--
-- ✅ Già eseguita in produzione (progetto Supabase sdxlcpxgbkagbxhukehd). Verificato sui dati
-- reali: un utente aveva già una Raccolta editoriale pre-esistente con 2 Diari dentro, entrambi
-- anche sul proprio scaffale — il passo 5a sotto garantisce che lo scaffale vinca sempre (quei 2
-- Diari sono rimasti sul loro scaffale, la vecchia raccolta è restata com'era ma vuota), non un
-- confronto arbitrario per data che li avrebbe fatti sparire dal banner della Libreria.

-- 1. Le Raccolte hanno bisogno di un ordine proprio (prima erano poche, mostrate senza un ordine
--    scelto dall'utente — gli Scaffali invece si riordinano, o almeno lo faranno).
ALTER TABLE collections ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;

-- Tiene traccia di quali collection_diaries nascono da QUESTA migration (dallo scaffale reale di
-- un Diario) — serve al passo 5: un Diario che risultasse anche in una vecchia raccolta editoriale
-- creata a mano (possibile: le Raccolte esistevano già, indipendenti dagli Scaffali, prima di
-- questa fusione) deve restare sul suo scaffale, non sparire da lì perché la vecchia raccolta
-- vince un confronto arbitrario per data. Verificato sui dati reali di produzione: un utente ha
-- già una raccolta di test con 2 Diari dentro, entrambi anche sul proprio scaffale — senza questa
-- precedenza esplicita quei 2 Diari sarebbero scomparsi dal banner della Libreria.
CREATE TEMP TABLE migrated_from_shelf (diary_id UUID PRIMARY KEY, collection_id UUID NOT NULL) ON COMMIT DROP;

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

      INSERT INTO migrated_from_shelf (diary_id, collection_id)
      SELECT d.id, new_collection_id FROM diaries d WHERE d.shelf_id = s.id
      ON CONFLICT DO NOTHING;
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

    INSERT INTO migrated_from_shelf (diary_id, collection_id) VALUES (d.id, new_collection_id) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 5a. Un Diario appena migrato dal suo scaffale reale (collection_id registrato in
--     migrated_from_shelf) vince su qualunque vecchia raccolta editoriale lo contenesse già:
--     tolgo quelle righe, non quella nuova.
DELETE FROM collection_diaries cd
USING migrated_from_shelf m
WHERE cd.diary_id = m.diary_id
  AND cd.collection_id <> m.collection_id;

-- 5b. Caso residuo, non toccato da 5a (un Diario in due vecchie raccolte editoriali, mai passato
--     da uno scaffale in questa migration — non osservato sui dati reali, ma non impossibile):
--     tiene solo la prima (posizione più bassa, poi raccolta più vecchia) e scarta le altre.
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
