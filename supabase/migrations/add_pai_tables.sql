-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 1 (PAI)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

-- ── Cache poligoni PAI (rischio idrogeologico ufficiale) ──────────────────────
-- bbox-keyed, stesso pattern lazy-cleanup di poi_cache (app/api/pois/route.ts) —
-- TTL lungo (90gg, gestito lato applicativo) perché i piani di bacino cambiano
-- su scala di anni, non vale ri-interrogare il WFS ad ogni calcolo SI.
-- source_authority non è una colonna qui: ogni feature in `features` porta già
-- il proprio sourceAuthority (vedi PaiFeature in lib/pai/paiClient.ts), dato che
-- un singolo bbox può attraversare più Autorità di Bacino.
CREATE TABLE IF NOT EXISTS pai_polygon_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  features      jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pai_polygon_cache_expires_at ON pai_polygon_cache (expires_at);

-- ── Backfill: ptpr_pois (drift preesistente, mai documentata in questo file) ──
-- Usata da app/api/pois/route.ts (fetchPtprPois) e popolata da scripts/import-ptpr.ts;
-- la tabella esiste già nel progetto Supabase live — CREATE TABLE IF NOT EXISTS è
-- un no-op lì, serve solo a far smettere supabase-schema.sql di mentire sullo
-- schema reale (vedi Rischio #7 del piano di integrazione).
CREATE TABLE IF NOT EXISTS ptpr_pois (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id     text,
  name          text,
  description   text,
  poi_type      text NOT NULL,
  layer         text NOT NULL,
  lat           float8 NOT NULL,
  lon           float8 NOT NULL,
  region        text NOT NULL,
  raw_props     jsonb,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (source_id, layer)
);

CREATE INDEX IF NOT EXISTS idx_ptpr_pois_lat_lon ON ptpr_pois (lat, lon);
