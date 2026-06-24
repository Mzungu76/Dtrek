-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 2 (PSInSAR)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco è anche presente in fondo a supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

-- ── Nuovo bucket TTL dedicato (180gg, non quello satellite a 7gg) ─────────────
-- Il prodotto PSInSAR è aggiornato su scala annuale/pluriennale — vedi
-- lib/si/signals/groundStability.ts e lib/si/computeSI.ts's GROUND_TTL_MS.
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_ground_computed_at timestamptz;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_ground_computed_at timestamptz;

-- ── Cache punti PSInSAR (velocità di deformazione del suolo) ──────────────────
-- bbox-keyed, stesso pattern lazy-cleanup di pai_polygon_cache — TTL lungo (180gg,
-- gestito lato applicativo) perché il prodotto è aggiornato su scala annuale/
-- pluriennale, non vale ri-interrogare il WFS ad ogni calcolo SI.
CREATE TABLE IF NOT EXISTS psinsar_point_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  points        jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_psinsar_point_cache_expires_at ON psinsar_point_cache (expires_at);
