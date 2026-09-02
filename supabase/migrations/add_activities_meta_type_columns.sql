-- ═══════════════════════════════════════════════════════════
-- Piano mete multi-tipologia (docs/piano-mete-multitipologia.md, Blocco E — Reportage §30).
-- Stesso principio del "travaso" già usato per guide_text/poi_wiki (vedi il commento in
-- app/api/resoconto/route.ts sopra la lettura di activity.guide_text): meta_type/site_type
-- vengono copiati dalla Meta (planned_hikes) sull'Attività al momento del salvataggio
-- (lib/activitySave.ts), così il Reportage resta generabile correttamente anche se la riga
-- planned_hikes di origine non esiste più o cambia — mai una dipendenza runtime dal join.
--
-- DEFAULT 'sentiero' per lo stesso motivo di add_meta_type_columns.sql: ogni riga già esistente
-- resta invariata, nessuna Attività storica cambia comportamento.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE activities ADD COLUMN IF NOT EXISTS meta_type TEXT NOT NULL DEFAULT 'sentiero'
  CHECK (meta_type IN ('sentiero', 'borgo_citta', 'sito'));

ALTER TABLE activities ADD COLUMN IF NOT EXISTS site_type TEXT
  CHECK (site_type IS NULL OR site_type IN (
    'museo', 'castello', 'abbazia', 'chiesa', 'sito_archeologico', 'monumento',
    'palazzo', 'teatro', 'cascata', 'grotta', 'belvedere', 'area_naturale', 'altro'
  ));

CREATE INDEX IF NOT EXISTS idx_activities_meta_type ON activities (meta_type);

NOTIFY pgrst, 'reload schema';
