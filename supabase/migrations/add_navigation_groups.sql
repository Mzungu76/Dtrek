-- ═══════════════════════════════════════════════════════════
-- Modalità gruppo — Fase 9 di docs/navigator-orizzonti-roadmap.md.
--
-- Modello scelto (decisione presa esplicitamente con l'utente, non una stima): stesso "link
-- pubblico broadcast" della Fase 1 — chiunque abbia il link del gruppo vede tutti i
-- partecipanti, nessun login richiesto per GUARDARE. Unirsi al gruppo (per PUBBLICARE la
-- propria posizione al suo interno) richiede invece essere autenticati, come già per la
-- condivisione individuale — i due lati (guardare vs. partecipare) non sono simmetrici per
-- design.
--
-- Un membro riusa esattamente il meccanismo di pubblicazione posizione della Fase 1
-- (hike_navigation_sessions.last_live_lat/lon/ts, lib/navigation/liveLocationPublish.ts):
-- nessuna colonna di posizione duplicata qui, questa tabella collega solo "quale sessione
-- appartiene a quale gruppo".
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hike_navigation_groups (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by              UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  planned_hike_id         TEXT REFERENCES planned_hikes(id) ON DELETE SET NULL,
  name                    TEXT,
  share_token             UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  share_token_expires_at  TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_groups_share_token ON hike_navigation_groups (share_token);
CREATE INDEX IF NOT EXISTS idx_nav_groups_created_by  ON hike_navigation_groups (created_by);

CREATE TABLE IF NOT EXISTS hike_navigation_group_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES hike_navigation_groups(id) ON DELETE CASCADE,
  session_id   UUID NOT NULL REFERENCES hike_navigation_sessions(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_nav_group_members_group ON hike_navigation_group_members (group_id);

ALTER TABLE hike_navigation_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hike_navigation_group_members ENABLE ROW LEVEL SECURITY;

-- Il creatore gestisce (crea/vede/cancella) il proprio gruppo.
DROP POLICY IF EXISTS "nav_groups_owner" ON hike_navigation_groups;
CREATE POLICY "nav_groups_owner"
  ON hike_navigation_groups FOR ALL
  USING     (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Un membro gestisce solo la PROPRIA riga di appartenenza (join/leave) — mai quella di altri.
-- Nota: unirsi a un gruppo altrui passa comunque dalla route app/api/navigation/groups/join
-- (client service-role, verifica il token lato server) perché un joiner non ha accesso in
-- lettura alla riga hike_navigation_groups di qualcun altro tramite questa RLS — questa policy
-- resta una rete di sicurezza per accessi diretti, non il percorso di enforcement primario.
DROP POLICY IF EXISTS "nav_group_members_self" ON hike_navigation_group_members;
CREATE POLICY "nav_group_members_self"
  ON hike_navigation_group_members FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Nessuna policy "public read" su nessuna delle due tabelle: la vista pubblica del gruppo
-- (mappa con tutti i partecipanti) passa sempre dal client service-role in
-- app/api/navigation/groups/[token], mai da PostgREST direttamente — stesso principio della
-- Fase 1 (vedi add_navigation_live_share.sql).

NOTIFY pgrst, 'reload schema';
