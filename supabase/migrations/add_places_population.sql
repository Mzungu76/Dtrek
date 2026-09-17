-- ═══════════════════════════════════════════════════════════
-- Piano mete multi-tipologia (docs/piano-mete-multitipologia.md §6) — "NON assumere Comune =
-- Borgo... Dtrek determina successivamente la classificazione turistica". I 7.896 Comuni importati
-- da ISTAT (source='istat') non hanno alcun segnale di rilevanza: Roma e un Comune di 80 abitanti
-- sono oggi indistinguibili (subtype NULL su tutte le righe). La popolazione è il primo segnale,
-- non l'unico previsto dal piano (liste curate come "Borghi più belli d'Italia"/"Bandiera
-- Arancione" restano un arricchimento successivo, §6).
--
-- Popolata da scripts/places/istat/population.ts via UPDATE su righe dtrek_places esistenti
-- (stesso pattern non invasivo di scripts/places/wikidata/enrich.ts: nessun INSERT).
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS population integer;

CREATE INDEX IF NOT EXISTS idx_dtrek_places_population ON dtrek_places (population);

NOTIFY pgrst, 'reload schema';
