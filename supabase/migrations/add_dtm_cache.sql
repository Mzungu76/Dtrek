-- ═══════════════════════════════════════════════════════════
-- Cache DTM (OpenTopography Global DEM, bbox-keyed) — lib/dtm/dtmCache.ts
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

-- Prima di questa tabella /api/tei-dtm non aveva alcuna cache: ogni richiesta
-- ri-scaricava e ri-decodificava un intero GeoTIFF da OpenTopography — uno dei
-- driver del consumo Active CPU su Vercel, stesso tipo di problema risolto per
-- tei-terrain in cf8b28d. tile serializza DtmTile con elevations come number[]
-- (jsonb non supporta TypedArray) — vedi lib/dtm/dtmCache.ts per il round-trip.
-- TTL lungo (180gg), come geologia: il terreno non cambia nel tempo a parità
-- di bbox.
CREATE TABLE IF NOT EXISTS dtm_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  tile          jsonb,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dtm_cache_expires_at ON dtm_cache (expires_at);
