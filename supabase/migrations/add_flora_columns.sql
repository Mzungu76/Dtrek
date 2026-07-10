-- ═══════════════════════════════════════════════════════════
-- Flora lungo la traccia — persistenza per-escursione, stesso pattern dei blocchi DTM/terreno/
-- area-protetta: planned_hikes.flora_result/flora_track_hash/flora_computed_at sono lette/
-- scritte da lib/useFlora.ts (via PATCH /api/planned) quando chiamato con un plannedId. Al primo
-- open che calcola con successo il risultato, viene persistito; alle aperture successive si legge
-- da qui invece di richiamare /api/trails/flora, finché flora_track_hash coincide con l'hash
-- della traccia corrente (lib/geoUtils.ts hashTrack) — nessun TTL temporale: la flora attorno a
-- una traccia fissa non cambia in modo rilevante nel breve periodo.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_result jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_computed_at timestamptz;
