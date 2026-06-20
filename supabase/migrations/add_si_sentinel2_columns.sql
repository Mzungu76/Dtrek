-- ═══════════════════════════════════════════════════════════
-- Security Index (SI) + Sentinel-2 enrichment — trails columns
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_score int;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_label text;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_signals jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_static_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_dynamic_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_satellite_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS is_ghost_trail boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dominant_warning text;

ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_ndvi_monthly jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_ndvi_delta float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_ndwi_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_nbr_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_evi_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_bsi_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_fire_detected boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_flood_detected boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_landslide_risk boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_shade_score float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_landscape_variety float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_water_sources jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_phenology_peak_month int;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_available boolean DEFAULT false;
