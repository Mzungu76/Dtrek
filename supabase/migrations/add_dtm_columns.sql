-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 3 (DTM, ora TINITALY/INGV — vedi
-- lib/geo/datasetConfig.ts's DTM_DATASET per il pivot dal LiDAR 1m PST-A)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
--
-- planned_hikes.dtm_profile/dtm_track_hash/dtm_computed_at sono lette/scritte da
-- app/guida/useDtmProfile.ts (via PATCH /api/planned): al primo open che calcola con successo
-- il profilo, il risultato viene persistito; alle aperture successive si legge da qui invece di
-- richiamare /api/tei-dtm, finché dtm_track_hash coincide con l'hash della traccia corrente
-- (lib/geoUtils.ts hashTrack) — nessun TTL temporale: un rilievo DTM non cambia nel tempo a
-- parità di traccia. Le colonne gemelle su `trails` (cache condivisa per traccia OSM, tra
-- utenti diversi che percorrono lo stesso sentiero) restano invece schema-only per ora.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;
