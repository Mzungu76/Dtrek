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


-- ── Impostazioni utente (chiave API Claude, abbonamento) ────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  claude_api_key    TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'premium'
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "user_settings_owner"
  ON user_settings FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


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

-- ── MeritaScore (deprecated columns kept for data compatibility) ─────────────
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS rpe          INTEGER;
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS merita_score DOUBLE PRECISION;

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS max_heart_rate       INTEGER;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS beauty_natura_weight INTEGER DEFAULT 50;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pref_sforzo          SMALLINT DEFAULT 50;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pref_durata          SMALLINT DEFAULT 50;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_face_data_url  TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS display_name         TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS personal_delta       DOUBLE PRECISION;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hr_hike_count        SMALLINT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_activities_merita_score ON activities (merita_score DESC NULLS LAST);

-- ── LootScore + TrailScore ────────────────────────────────────────────────────
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS soddisfazione INTEGER;
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS loot_score    DOUBLE PRECISION;
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS trail_score   DOUBLE PRECISION;

-- Biometric profile (replaces manual FCmax setting)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_age        INTEGER;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_weight_kg  DOUBLE PRECISION;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_height_cm  INTEGER;

CREATE INDEX IF NOT EXISTS idx_activities_loot_score  ON activities (loot_score  DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_activities_trail_score ON activities (trail_score DESC NULLS LAST);

-- TrailScore cache for planned hikes
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_trail_score DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_planned_trail_score ON planned_hikes (cached_trail_score DESC NULLS LAST);

-- Invalidate stale TrailScore values (computed with old formula, before beauty categories caching)
UPDATE activities
SET trail_score = NULL
WHERE trail_score IS NOT NULL
  AND (linked_beauty_score IS NULL OR linked_beauty_score->'categories' IS NULL);


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
