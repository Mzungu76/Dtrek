-- ═══════════════════════════════════════════════════════════
-- Backfill di colonne su planned_hikes che il codice applicativo scriveva/leggeva già da tempo
-- ma che non erano mai state effettivamente applicate al database (favorite non era nemmeno
-- documentata in supabase-schema.sql; terrain_*/cached_in_protected_area*/flora_* lo erano ma
-- il rispettivo ALTER TABLE non era mai stato eseguito). Confermato dai log di produzione:
-- ogni PATCH /api/planned che includeva questi campi falliva con PGRST204 "column not found",
-- quindi "Preferiti" (favorite), il profilo terreno, il check aree protette e la flora non
-- sono mai stati salvati lato Supabase — restavano solo nella cache locale del dispositivo che
-- li aveva calcolati, finché qualcosa (nuovo dispositivo, cache svuotata, o il nuovo pull engine
-- in lib/sync/pullEngine.ts) non andava a rileggere la versione "vera" dal server, facendoli
-- sparire. ADD COLUMN IF NOT EXISTS è idempotente anche se qualcuna esistesse già.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS favorite boolean DEFAULT false;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_profile jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_computed_at timestamptz;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_in_protected_area boolean;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_protected_area_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_protected_area_computed_at timestamptz;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_result jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_computed_at timestamptz;
