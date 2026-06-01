-- ═══════════════════════════════════════════════════════════
-- DTrek – Supabase schema
-- Incolla nel Supabase SQL Editor e premi Run
-- ═══════════════════════════════════════════════════════════

-- ── Escursioni completate ────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id                    TEXT PRIMARY KEY,
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
  route_polyline        JSONB,          -- polilinea ridotta (max 60 pt) per thumbnail
  track_points          JSONB NOT NULL DEFAULT '[]', -- tutti i punti GPS
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_start_time ON activities (start_time DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_rating ON activities (user_rating DESC NULLS LAST);

-- ── Aggiornamenti schema ─────────────────────────────────────────────────────
-- Esegui solo se la tabella è già esistente (da una versione precedente):
ALTER TABLE activities ADD COLUMN IF NOT EXISTS linked_planned_track_points JSONB;

-- ── Escursioni pianificate ───────────────────────────────────
CREATE TABLE IF NOT EXISTS planned_hikes (
  id                      TEXT PRIMARY KEY,
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
  cached_beauty_score     JSONB
);

CREATE INDEX IF NOT EXISTS idx_planned_created_at     ON planned_hikes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planned_planned_date   ON planned_hikes (planned_date ASC NULLS LAST);
