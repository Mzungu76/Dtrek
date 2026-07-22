-- ═══════════════════════════════════════════════════════════
-- Colonna dichiarata in supabase-schema.sql ma mai applicata al progetto Supabase live — stesso
-- pattern di add_hiker_profile_and_guide_notices_columns.sql.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

-- Consenso al terzo livello (AI + ricerca web) della risoluzione di un luogo noto nel route
-- builder (lib/routeBuilder/resolvePlace.ts) — usato solo quando Nominatim e la ricerca Overpass
-- per nome non trovano nulla. Default ON/opt-out, sovrascrivibile per singola ricerca nel wizard.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS route_build_ai_place_search BOOLEAN NOT NULL DEFAULT true;
