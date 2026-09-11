-- Stesso motivo di backfill_default_diary_cover.sql, ma per titolo/sottotitolo/autore: la pagina
-- /diario/libro (il libro impaginato) ha sempre letto/scritto la propria configurazione su
-- `user_settings.diary_config` (il vecchio Diario singolo per utente), separata dalla riga in
-- `diaries` che il nuovo hub "Diari" e il Sommario leggono/scrivono — quindi un titolo o
-- sottotitolo personalizzato lì non compariva mai sulla copertina di /diario, e viceversa.
--
-- Ora /diario/libro legge/scrive anch'esso `diaries.title/subtitle/author` (via
-- /api/diaries/[id]/config) per il Diario di default — questo backfill riporta lì, una volta sola,
-- ciò che l'utente aveva già personalizzato nella vecchia configurazione, SOLO dove la riga in
-- `diaries` è ancora ai valori del backfill iniziale (mai toccata dal nuovo hub): non sovrascrive
-- mai una personalizzazione già fatta con il nuovo Sommario/hub dopo la migrazione a `diaries`.
--
-- Esegui nel Supabase SQL Editor, dopo backfill_default_diary_cover.sql (idempotente).

UPDATE diaries d
SET
  title    = COALESCE(NULLIF(us.diary_config->>'title', ''), d.title),
  subtitle = COALESCE(NULLIF(us.diary_config->>'subtitle', ''), d.subtitle),
  author   = COALESCE(NULLIF(us.diary_config->>'author', ''), d.author)
FROM user_settings us
WHERE d.user_id = us.user_id
  AND d.is_default = true
  AND d.title = 'Il mio Diario'
  AND (d.subtitle IS NULL OR d.subtitle = '')
  AND (d.author IS NULL OR d.author = '')
  AND us.diary_config IS NOT NULL;
