-- Lunghezza del testo AI scelta dall'utente per ciascuna sezione della guida (essenziale /
-- approfondita / molto_approfondita — vedi lib/guideSections.ts's GuideTextLength). JSONB (non
-- TEXT[] come guide_breve_sections) perché qui serve una mappa chiave→valore per sezione, non un
-- semplice elenco. NULL/chiave assente ⇒ 'essenziale' per quella sezione (vedi
-- sanitizeSectionLengths in lib/guideSections.ts), lo stesso comportamento generato da sempre.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS guide_section_lengths JSONB;
