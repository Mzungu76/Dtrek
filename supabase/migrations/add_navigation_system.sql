-- ═══════════════════════════════════════════════════════════
-- Sistema di navigazione GPS in tempo reale durante le escursioni
-- (mappa offline, POI live, guida contestuale). Vedi lib/navigation/.
--
-- hike_navigation_sessions: una riga per ogni avvio di "Navigazione attiva".
-- hike_navigation_events:   log append-only best-effort (gps_lost, off_route,
--   poi_reached, ...). Scritto in coda offline e sincronizzato quando torna
--   la rete — NON è la fonte di verità in tempo reale (quella vive lato
--   client in IndexedDB, vedi lib/navigation/navigationStore.ts), perché
--   durante l'escursione l'app è spesso senza connessione.
-- hike_navigation_track:    un fix di posizione ogni 5-10s per sessione.
--   Non serve al runtime della navigazione: è il dato grezzo per feature
--   future (replay, heatmap, statistiche per tratto) — costa poco salvarlo
--   ora, sarebbe costoso ricostruirlo dopo.
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes
  ADD COLUMN IF NOT EXISTS offline_bbox          JSONB,
  ADD COLUMN IF NOT EXISTS offline_package_status TEXT DEFAULT 'none', -- 'none' | 'queued' | 'downloading' | 'paused' | 'ready' | 'stale' | 'error'
  ADD COLUMN IF NOT EXISTS offline_package_meta   JSONB,
  ADD COLUMN IF NOT EXISTS poi_notify_radius_m    INTEGER DEFAULT 150;

CREATE TABLE IF NOT EXISTS hike_navigation_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_hike_id TEXT REFERENCES planned_hikes(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'completed' | 'aborted'
  device_info     JSONB
);

CREATE INDEX IF NOT EXISTS idx_nav_sessions_hike ON hike_navigation_sessions (planned_hike_id);
CREATE INDEX IF NOT EXISTS idx_nav_sessions_user ON hike_navigation_sessions (user_id);

CREATE TABLE IF NOT EXISTS hike_navigation_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES hike_navigation_sessions(id) ON DELETE CASCADE,
  type        TEXT NOT NULL, -- 'gps_lost' | 'gps_recovered' | 'off_route' | 'on_route_again' | 'poi_reached' | 'moment_reached' | 'guide_callout_shown' | 'low_battery'
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_events_session ON hike_navigation_events (session_id, type);

CREATE TABLE IF NOT EXISTS hike_navigation_track (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES hike_navigation_sessions(id) ON DELETE CASCADE,
  ts          TIMESTAMPTZ NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  altitude_m  DOUBLE PRECISION,
  speed_ms    DOUBLE PRECISION,
  accuracy_m  DOUBLE PRECISION,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_track_session ON hike_navigation_track (session_id, ts);

-- ── Row Level Security (stesso pattern owner-based di activities/planned_hikes) ──

ALTER TABLE hike_navigation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hike_navigation_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hike_navigation_track    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nav_sessions_owner" ON hike_navigation_sessions;
CREATE POLICY "nav_sessions_owner"
  ON hike_navigation_sessions FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "nav_events_owner" ON hike_navigation_events;
CREATE POLICY "nav_events_owner"
  ON hike_navigation_events FOR ALL
  USING (
    session_id IN (SELECT id FROM hike_navigation_sessions WHERE user_id = auth.uid())
  )
  WITH CHECK (
    session_id IN (SELECT id FROM hike_navigation_sessions WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "nav_track_owner" ON hike_navigation_track;
CREATE POLICY "nav_track_owner"
  ON hike_navigation_track FOR ALL
  USING (
    session_id IN (SELECT id FROM hike_navigation_sessions WHERE user_id = auth.uid())
  )
  WITH CHECK (
    session_id IN (SELECT id FROM hike_navigation_sessions WHERE user_id = auth.uid())
  );
