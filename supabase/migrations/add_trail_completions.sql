-- ═══════════════════════════════════════════════════════════
-- Community layer leggero — Fase 4 di docs/navigator-orizzonti-roadmap.md.
--
-- Tabella privata (RLS owner-only) — NESSUNA policy "public read". A differenza di
-- trail_difficulty_markers (public-read diretto, dati derivati da import GPX, non testo libero
-- per-utente), qui ogni riga porta user_id + testo libero: esporla 1:1 via PostgREST
-- rivelerebbe identità/comportamento individuale (chi ha fatto quale sentiero quando). La
-- lettura pubblica (conteggi aggregati + note filtrate) passa sempre da
-- app/api/trails/completions (GET) col client service-role, mai da una query diretta su questa
-- tabella — vedi il commento in quel file per il perché non esiste nemmeno una VIEW pubblica.
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trail_completions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id       TEXT REFERENCES activities(id) ON DELETE CASCADE,
  osm_relation_id   BIGINT,              -- risolto via findTrailForPolyline, nullable se non matchato
  polyline_hash     TEXT,                -- riservato per un futuro fuzzy-match quando osm_relation_id è NULL — non ancora usato in lettura
  completed_at      TIMESTAMPTZ NOT NULL,
  note              TEXT,                -- opzionale, max 280 caratteri (enforced app-side, lib/community/moderation.ts)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trail_completions_osm  ON trail_completions (osm_relation_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_trail_completions_user ON trail_completions (user_id);

ALTER TABLE trail_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trail_completions_owner" ON trail_completions;
CREATE POLICY "trail_completions_owner"
  ON trail_completions FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
