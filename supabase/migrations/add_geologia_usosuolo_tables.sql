-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 4 (Geologia CARG + Uso del suolo)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

-- ── Cache geologia (litologia CARG, per-punto via WMS GetFeatureInfo) ─────────
-- point_key (non bbox_key): GetFeatureInfo risponde per un singolo punto, non
-- un'area — stesso rounding a 2 decimali (~1km) di normalizeBboxKey, riusato su
-- "lat,lon" invece che su un bbox a 4 valori. feature può essere JSON null
-- (nessun dato litologico in quel punto) — stesso stato cacheable di un array
-- vuoto in pai_polygon_cache. TTL lungo (180gg): la litologia non cambia nel
-- tempo a parità di punto.
CREATE TABLE IF NOT EXISTS geologia_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  point_key     text NOT NULL UNIQUE,
  feature       jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geologia_cache_expires_at ON geologia_cache (expires_at);

-- ── Cache uso del suolo (land-cover, bbox-keyed via WCS GetCoverage) ──────────
-- tile serializza UsoSuoloTile con classCodes come number[] (jsonb non supporta
-- TypedArray) — vedi lib/usosuolo/usoSuoloCache.ts per il round-trip. TTL più
-- corto (30gg) di PAI/geologia: il land cover cambia su scala stagionale/
-- annuale (incendi, disboscamento, stagioni), non pluriennale.
CREATE TABLE IF NOT EXISTS uso_suolo_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  tile          jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uso_suolo_cache_expires_at ON uso_suolo_cache (expires_at);
