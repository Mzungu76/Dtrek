-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 3 (DTM 1m LiDAR)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
--
-- Schema-only in questa fase: nessun codice applicativo legge/scrive
-- ancora queste colonne (vedi lib/dtm/trailDtmProfile.ts, ricalcolato
-- ad ogni CTS via /api/tei-dtm, stesso schema "nessuna persistenza" di
-- /api/tei-overpass). dtm_track_hash invece di un TTL temporale: un
-- rilievo LiDAR non cambia nel tempo a parità di traccia, l'invalidazione
-- naturale è un hash della traccia densa, non una scadenza.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;
