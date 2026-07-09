-- ═══════════════════════════════════════════════════════════
-- Profilo terreno (uso del suolo + geologia lungo la traccia, vedi
-- lib/terrain/trailTerrainProfile.ts) — persistenza per-escursione, stesso pattern di
-- add_dtm_columns.sql: planned_hikes.terrain_profile/terrain_track_hash/terrain_computed_at
-- sono lette/scritte da app/guida/useTerrainProfile.ts (via PATCH /api/planned). Al primo open
-- che calcola con successo il profilo, il risultato viene persistito; alle aperture successive
-- si legge da qui invece di richiamare /api/tei-terrain, finché terrain_track_hash coincide con
-- l'hash della traccia corrente (lib/geoUtils.ts hashTrack) — nessun TTL temporale: il terreno
-- non cambia nel tempo a parità di traccia.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_profile jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_computed_at timestamptz;
