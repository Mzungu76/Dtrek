-- Fase 12 di docs/diario-a-libro-piano.md: le copertine dei Diari mostrate sullo scaffale, nel
-- drawer e in cima al Sommario leggono `diaries.cover_url` — ma quella colonna è sempre stata
-- NULL per il Diario di default di ogni utente, perché il backfill che l'ha creato
-- (backfill_diaries_from_existing_data.sql) è avvenuto PRIMA che esistesse `diaries` come
-- tabella, quando l'unica copertina possibile era quella del vecchio Diario singolo per utente:
-- `user_settings.diary_config->>'coverUrl'` (add_diary_config.sql), impostata da chi aveva già
-- caricato una foto copertina su /diario prima che i Diari multipli esistessero.
--
-- Questo backfill copia quella foto — se esiste — su `diaries.cover_url` del Diario di default,
-- SOLO dove `cover_url` è ancora NULL (mai sovrascrive una copertina già impostata dopo). Nessun
-- altro campo (titolo/sottotitolo/autore) è toccato: l'utente ha chiesto solo l'immagine.
--
-- Esegui nel Supabase SQL Editor (idempotente).

UPDATE diaries d
SET cover_url = us.diary_config->>'coverUrl'
FROM user_settings us
WHERE d.user_id = us.user_id
  AND d.is_default = true
  AND d.cover_url IS NULL
  AND us.diary_config->>'coverUrl' IS NOT NULL;
