-- ═══════════════════════════════════════════════════════════
-- Segnalazioni di chiusura sentiero — DTREK-AUDIT.md P0 #5 (Red Team): prima di questa tabella
-- non esisteva alcun sistema di chiusura sentiero verificato, solo una regex su testo di GPX
-- importati (lib/difficultyMarkers.ts).
--
-- Mirror di trail_completions (add_trail_completions.sql): tabella privata (RLS owner-only),
-- NESSUNA policy "public read" — ogni riga porta user_id, esporla 1:1 via PostgREST rivelerebbe
-- chi ha segnalato cosa. La lettura pubblica (stato aggregato con quorum, mai righe individuali)
-- passa sempre da app/api/trails/closures (GET) col client service-role — vedi
-- lib/community/closureSummary.ts.
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trail_closure_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  osm_relation_id   BIGINT,              -- risolto via findTrailForPolyline, nullable se non matchato
  status            TEXT NOT NULL CHECK (status IN ('closed', 'reopened')),
  reason            TEXT,                -- opzionale, max 280 caratteri (enforced app-side, lib/community/moderation.ts)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trail_closure_reports_osm  ON trail_closure_reports (osm_relation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trail_closure_reports_user ON trail_closure_reports (user_id);

ALTER TABLE trail_closure_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trail_closure_reports_owner" ON trail_closure_reports;
CREATE POLICY "trail_closure_reports_owner"
  ON trail_closure_reports FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
