-- ═══════════════════════════════════════════════════════════
-- Live location sharing — Fase 1 di docs/navigator-orizzonti-roadmap.md.
--
-- Aggiunge a hike_navigation_sessions un token pubblico opzionale
-- (share_token) e una singola riga di "ultima posizione nota"
-- (last_live_*) aggiornata in-place durante la navigazione — non uno
-- storico di fix: un contatto con il link vuole solo "dov'è adesso",
-- e hike_navigation_track (fix ogni 5-10s, sync a batch ogni ~30s) è
-- esplicitamente documentata come "NOT the real-time source of truth",
-- quindi non adatta a questo scopo.
--
-- share_token_expires_at: un link di posizione pubblico non deve
-- restare valido a tempo indeterminato — impostato a creazione/rinnovo
-- del token (lato app: now() + 12h), verificato da lib/liveSharePublic.ts
-- ad ogni lettura pubblica, non solo alla presenza del token.
--
-- Nessuna nuova policy RLS: "nav_sessions_owner" (già esistente, vedi
-- add_navigation_system.sql) copre già SELECT/UPDATE per il proprietario
-- su queste nuove colonne. La lettura pubblica non passa mai da
-- PostgREST/RLS su questa tabella — solo dal client service-role dentro
-- app/api/navigation/share/[token]/route.ts.
--
-- Dopo aver eseguito questa migration: NOTIFY pgrst, 'reload schema';
-- (vedi README — hike_navigation_sessions è già in uso, PostgREST non
-- ricarica da solo la cache dello schema quando si aggiunge una colonna).
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE hike_navigation_sessions
  ADD COLUMN IF NOT EXISTS share_token             UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS share_enabled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_live_lat            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_live_lon            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_live_ts             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_live_accuracy_m     DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_nav_sessions_share_token
  ON hike_navigation_sessions (share_token)
  WHERE share_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
