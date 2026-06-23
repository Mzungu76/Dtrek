-- ═══════════════════════════════════════════════════════════
-- Security Index (SI) + Sentinel-2 enrichment — planned_hikes columns
-- Mirror of add_si_sentinel2_columns.sql (trails), but on planned_hikes:
-- osm_relation_id lets a planned hike reuse the shared `trails` cache once
-- matched; the si_*/s2_* columns are the *own* cache used when a planned
-- hike has no OSM correspondence at all (computeSIForPlannedHike /
-- computeSentinel2ForPlannedHike in lib/si/computeSI.ts /
-- lib/sentinel2/computeSentinel2.ts).
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS osm_relation_id bigint;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_score int;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_label text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_signals jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_computed_at timestamptz;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_static_computed_at timestamptz;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_dynamic_computed_at timestamptz;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_satellite_computed_at timestamptz;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS is_ghost_trail boolean DEFAULT false;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dominant_warning text;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_ndvi_monthly jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_ndvi_delta float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_ndwi_current float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_nbr_current float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_evi_current float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_bsi_current float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_fire_detected boolean DEFAULT false;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_flood_detected boolean DEFAULT false;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_landslide_risk boolean DEFAULT false;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_shade_score float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_landscape_variety float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_water_sources jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_phenology_peak_month int;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_computed_at timestamptz;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS s2_available boolean DEFAULT false;
