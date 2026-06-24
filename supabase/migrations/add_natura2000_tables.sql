-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 5 (Rete Natura 2000)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

-- ── Cache poligoni Natura 2000 (SIC/ZSC/ZPS) ──────────────────────────────────
-- bbox-keyed, stesso pattern lazy-cleanup di pai_polygon_cache. TTL più lungo
-- (270gg) di PAI (90gg): le designazioni di siti protetti cambiano su scala
-- pluriennale, ancora più stabili di un piano di bacino.
CREATE TABLE IF NOT EXISTS natura2000_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  features      jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_natura2000_cache_expires_at ON natura2000_cache (expires_at);
