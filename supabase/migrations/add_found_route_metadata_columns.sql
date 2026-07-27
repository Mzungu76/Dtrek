-- ═══════════════════════════════════════════════════════════
-- Colonne dichiarate in supabase-schema.sql ma mai applicate al progetto Supabase live — stesso
-- pattern di add_route_build_ai_place_search_column.sql.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

-- Metadati di un percorso "trovato" da Giulia (ricerca AI di un percorso già documentato altrove,
-- fusa nel wizard "Costruisci un percorso" — vedi components/upload/RouteBuilder.tsx e
-- GiuliaSearchPanel.tsx) invece che costruito algoritmicamente. Assenti su un percorso costruito o
-- importato in altro modo. Valorizzate una sola volta al salvataggio, mai modificate dopo.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS source_url      TEXT;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS comfort_verdict TEXT;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS comfort_note    TEXT;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS zone            TEXT;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS difficulty      TEXT;
