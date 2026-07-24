-- Rimuove tabelle/colonne di PAI, Geologia (CARG) e Sentinel-2: nessun codice applicativo le
-- popola o le legge più (vedi lib/geologia/*, app/api/geologia-tile/route.ts, lib/aiNatureContext.ts
-- rimossi/aggiornati nello stesso commit). Da eseguire manualmente nel SQL Editor di Supabase.

-- PAI (rischio idrogeologico) — mai referenziata da codice applicativo, solo dallo schema.
DROP TABLE IF EXISTS pai_polygon_cache;

-- Geologia CARG (litologia) — client/cache rimossi, lithologyRiskMap sempre 'unknown'.
DROP TABLE IF EXISTS geologia_cache;

-- Sentinel-2 (NDVI/fenologia/fire-flood-landslide) — colonne mai scritte da nessun job/script,
-- lette solo per essere inoltrate (sempre null) a lib/aiNatureContext.ts, ora semplificato.
ALTER TABLE trails DROP COLUMN IF EXISTS s2_ndvi_monthly;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_ndvi_delta;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_ndwi_current;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_nbr_current;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_evi_current;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_bsi_current;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_fire_detected;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_flood_detected;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_landslide_risk;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_shade_score;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_landscape_variety;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_water_sources;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_phenology_peak_month;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_computed_at;
ALTER TABLE trails DROP COLUMN IF EXISTS s2_available;

ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_ndvi_monthly;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_ndvi_delta;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_ndwi_current;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_nbr_current;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_evi_current;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_bsi_current;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_fire_detected;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_flood_detected;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_landslide_risk;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_shade_score;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_landscape_variety;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_water_sources;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_phenology_peak_month;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_computed_at;
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS s2_available;
