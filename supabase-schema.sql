-- ═══════════════════════════════════════════════════════════
-- DTrek – Supabase schema
-- Incolla nel Supabase SQL Editor e premi Run
-- ═══════════════════════════════════════════════════════════

-- ── Escursioni completate ────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id                    TEXT PRIMARY KEY,
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL DEFAULT 'Escursione',
  start_time            TIMESTAMPTZ NOT NULL,
  end_time              TIMESTAMPTZ,
  sport                 TEXT DEFAULT 'Other',
  notes                 TEXT DEFAULT '',
  device                TEXT DEFAULT '',
  distance_meters       DOUBLE PRECISION DEFAULT 0,
  total_time_seconds    DOUBLE PRECISION DEFAULT 0,
  calories              INTEGER DEFAULT 0,
  avg_heart_rate        DOUBLE PRECISION DEFAULT 0,
  max_heart_rate        DOUBLE PRECISION DEFAULT 0,
  avg_speed_ms          DOUBLE PRECISION DEFAULT 0,
  max_speed_ms          DOUBLE PRECISION DEFAULT 0,
  altitude_min          DOUBLE PRECISION DEFAULT 0,
  altitude_max          DOUBLE PRECISION DEFAULT 0,
  elevation_gain        DOUBLE PRECISION DEFAULT 0,
  elevation_loss        DOUBLE PRECISION DEFAULT 0,
  file_name             TEXT,
  user_notes            TEXT,
  tags                  TEXT[],
  user_rating           INTEGER,
  user_rating_note      TEXT,
  linked_planned_id     TEXT,
  linked_beauty_score   JSONB,
  linked_planned_track_points JSONB,
  route_polyline        JSONB,
  track_points          JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_start_time  ON activities (start_time DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_rating ON activities (user_rating DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_activities_user_id     ON activities (user_id);

-- ── Escursioni pianificate ───────────────────────────────────
CREATE TABLE IF NOT EXISTS planned_hikes (
  id                      TEXT PRIMARY KEY,
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  planned_date            DATE,
  file_name               TEXT,
  user_notes              TEXT,
  tags                    TEXT[],
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  distance_meters         DOUBLE PRECISION DEFAULT 0,
  elevation_gain          DOUBLE PRECISION DEFAULT 0,
  elevation_loss          DOUBLE PRECISION DEFAULT 0,
  altitude_max            DOUBLE PRECISION DEFAULT 0,
  altitude_min            DOUBLE PRECISION DEFAULT 0,
  estimated_time_seconds  DOUBLE PRECISION DEFAULT 0,
  route_polyline          JSONB,
  track_points            JSONB NOT NULL DEFAULT '[]',
  assessment              JSONB,
  cached_beauty_score     JSONB,
  cached_pois             JSONB,
  cached_poi_wiki         JSONB,
  cached_guide            TEXT
);

CREATE INDEX IF NOT EXISTS idx_planned_created_at   ON planned_hikes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planned_planned_date ON planned_hikes (planned_date ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_planned_user_id      ON planned_hikes (user_id);


-- ═══════════════════════════════════════════════════════════
-- AGGIORNAMENTI SCHEMA (se le tabelle esistono già)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS linked_planned_track_points JSONB;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_pois     JSONB;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_poi_wiki JSONB;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide    TEXT;

CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities    (user_id);
CREATE INDEX IF NOT EXISTS idx_planned_user_id    ON planned_hikes (user_id);


-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY  (doppio strato di sicurezza)
-- ═══════════════════════════════════════════════════════════

-- Abilita RLS sulle tabelle
ALTER TABLE activities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_hikes ENABLE ROW LEVEL SECURITY;

-- Ogni utente vede e modifica solo i propri dati
CREATE POLICY IF NOT EXISTS "activities_owner"
  ON activities FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "planned_hikes_owner"
  ON planned_hikes FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- MIGRAZIONE DATI ESISTENTI
-- Esegui DOPO aver creato il tuo account su DTrek.
-- Sostituisci 'INCOLLA-QUI-IL-TUO-UUID' con il tuo user_id
-- (visibile in Supabase → Authentication → Users)
-- ═══════════════════════════════════════════════════════════
-- UPDATE activities    SET user_id = 'INCOLLA-QUI-IL-TUO-UUID' WHERE user_id IS NULL;
-- UPDATE planned_hikes SET user_id = 'INCOLLA-QUI-IL-TUO-UUID' WHERE user_id IS NULL;
