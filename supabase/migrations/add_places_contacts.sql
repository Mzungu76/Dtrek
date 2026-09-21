-- ═══════════════════════════════════════════════════════════
-- MIC_DATA_SOURCES.md §7/§10/§12 — telefono ed email sono tra i campi esplicitamente richiesti
-- per un Sito (es. il caso di test Museo delle tradizioni popolari di Canepina), verificati reali
-- e con predicato letterale confermato su dati veri (`sm:telephoneNumber`/`sm:emailAddress`,
-- probe `contatti-canepina-un-salto-oltre` in scripts/places/mic/probe.ts): `dtrek_places` non ha
-- ancora colonne per loro — `website` esiste già (`sm:URL`, stesso salto), solo phone/email mancano.
--
-- Popolati da scripts/places/mic/fetch.ts (prossimo commit su questo branch) via lo stesso
-- import.ts/candidateToPartialUpdate già usato per website/opening_hours — nessuna colonna nuova
-- per orari e prezzi qui: quelli restano sotto `metadata.fieldProvenance`/`opening_hours` (jsonb
-- già esistenti, vedi MIC_DATA_SOURCES.md §10), telefono/email sono invece testo semplice come
-- website, non strutture composite.
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS). Stesso blocco anche in
-- supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS email text;

NOTIFY pgrst, 'reload schema';
