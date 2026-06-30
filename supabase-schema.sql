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

-- ── Tratti difficili segnalati nei file GPX importati (Komoot/AllTrails) ───
-- Waypoint/commenti del tracciato classificati per gravità — vedi
-- lib/difficultyMarkers.ts. Alimentano la componente Community del SI
-- (lib/si/signals/communitySignals.ts), interrogata per prossimità
-- geografica e non per FK rigida.
CREATE TABLE IF NOT EXISTS trail_difficulty_markers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_hike_id TEXT REFERENCES planned_hikes(id) ON DELETE CASCADE,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  source          TEXT NOT NULL,
  source_text     TEXT NOT NULL,
  severity        TEXT NOT NULL,
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_difficulty_markers_planned_hike ON trail_difficulty_markers (planned_hike_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_markers_latlon       ON trail_difficulty_markers (lat, lon);


-- ── Impostazioni utente (chiave API Claude, abbonamento) ────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  claude_api_key    TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'premium'
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_owner" ON user_settings;
CREATE POLICY "user_settings_owner"
  ON user_settings FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
-- AGGIORNAMENTI SCHEMA (se le tabelle esistono già)
-- ═══════════════════════════════════════════════════════════

-- ── MeritaScore (deprecated columns kept for data compatibility) ─────────────
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS rpe          INTEGER;
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS merita_score DOUBLE PRECISION;

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS max_heart_rate       INTEGER;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS beauty_natura_weight INTEGER DEFAULT 50;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pref_sforzo          SMALLINT DEFAULT 50;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pref_durata          SMALLINT DEFAULT 270; -- minuti: 60=1h…480=8h+
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
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_trail_score             DOUBLE PRECISION;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_trail_score_confidence  TEXT;

-- SafetyScore cache for planned hikes
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_safety_score JSONB;

CREATE INDEX IF NOT EXISTS idx_planned_trail_score ON planned_hikes (cached_trail_score DESC NULLS LAST);

-- ── Link pubblici condivisibili ───────────────────────────────────────────────
-- Quando share_token è valorizzato, l'escursione è visibile pubblicamente
-- alla pagina /s/{token}. È opt-in: l'utente lo genera dalla condivisione e
-- può revocarlo (token → NULL). La lettura pubblica usa il client service-role
-- (bypassa RLS) filtrando per token non indovinabile.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_activities_share_token ON activities (share_token);

-- Invalidate stale TrailScore values (computed with old formula, before beauty categories caching)
UPDATE activities
SET trail_score = NULL
WHERE trail_score IS NOT NULL
  AND (linked_beauty_score IS NULL OR linked_beauty_score->'categories' IS NULL);


-- ── Resoconti escursioni ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS hike_reports (
  id            TEXT PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id   TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  photos        JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hike_reports_user_id     ON hike_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_hike_reports_activity_id ON hike_reports (activity_id);

-- Condivisione pubblica dei resoconti tramite PDF (Supabase Storage)
ALTER TABLE hike_reports ADD COLUMN IF NOT EXISTS share_pdf_url TEXT;

-- Diario pubblico tramite PDF + token opaco per il link del viewer
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS diary_pdf_url TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS diary_token   UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_user_settings_diary_token ON user_settings (diary_token);

-- Sesso dell'utente, usato dalla AI per l'accordo grammaticale di genere nella guida
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_gender TEXT CHECK (user_gender IN ('maschio','femmina','altro','non_specificato'));

-- ── Supabase Storage bucket per PDF pubblici ──────────────────────────────────
-- Esegui nel SQL Editor di Supabase:
--
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('dtrek-reports', 'dtrek-reports', true)
--   ON CONFLICT (id) DO NOTHING;
--
-- DROP POLICY IF EXISTS "users_write_own_reports" ON storage.objects;
-- CREATE POLICY "users_write_own_reports" ON storage.objects
--   FOR INSERT WITH CHECK (
--     auth.uid()::text = (storage.foldername(name))[1]
--     AND bucket_id = 'dtrek-reports'
--   );
--
-- DROP POLICY IF EXISTS "users_update_own_reports" ON storage.objects;
-- CREATE POLICY "users_update_own_reports" ON storage.objects
--   FOR UPDATE USING (
--     auth.uid()::text = (storage.foldername(name))[1]
--     AND bucket_id = 'dtrek-reports'
--   );
--
-- DROP POLICY IF EXISTS "public_read_reports" ON storage.objects;
-- CREATE POLICY "public_read_reports" ON storage.objects
--   FOR SELECT USING (bucket_id = 'dtrek-reports');

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY  (doppio strato di sicurezza)
-- ═══════════════════════════════════════════════════════════

-- Abilita RLS sulle tabelle
ALTER TABLE activities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_hikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hike_reports  ENABLE ROW LEVEL SECURITY;

-- Ogni utente vede e modifica solo i propri dati
DROP POLICY IF EXISTS "activities_owner" ON activities;
CREATE POLICY "activities_owner"
  ON activities FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "planned_hikes_owner" ON planned_hikes;
CREATE POLICY "planned_hikes_owner"
  ON planned_hikes FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "hike_reports_owner" ON hike_reports;
CREATE POLICY "hike_reports_owner"
  ON hike_reports FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── Questionari guidati per i resoconti (racconto co-scritto) ────────────────
CREATE TABLE IF NOT EXISTS hike_questionnaires (
  id             TEXT PRIMARY KEY,            -- 'questionnaire-{activityId}'
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'completed' | 'skipped'
  questions      JSONB NOT NULL DEFAULT '[]',
  answers        JSONB NOT NULL DEFAULT '{}',
  current_index  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hike_questionnaires_activity_id ON hike_questionnaires (activity_id);
CREATE INDEX IF NOT EXISTS idx_hike_questionnaires_user_id     ON hike_questionnaires (user_id);

ALTER TABLE hike_questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hike_questionnaires_owner" ON hike_questionnaires;
CREATE POLICY "hike_questionnaires_owner"
  ON hike_questionnaires FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── Cache statistiche sentieri (Esplora) ──────────────────────────────────────
-- Dato di riferimento condiviso (non per-utente, niente user_id/RLS): le relazioni
-- OSM spesso non hanno i tag distance/ascent/descent popolati, quindi le statistiche
-- vengono calcolate con un fallback a cascata (tag OSM → Haversine + OpenTopoData →
-- stima da bbox) e cachate qui per evitare di richiamare Overpass/OpenTopoData ad
-- ogni apertura dello stesso sentiero. Letture/scritture solo via client service-role.
CREATE TABLE IF NOT EXISTS trails (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_relation_id       bigint UNIQUE NOT NULL,
  name                  text,
  distance_km           float,
  elevation_gain        int,
  elevation_loss        int,
  estimated_time_min    int,
  difficulty            text,             -- scala SAC (T1-T6)
  route_type            text,             -- 'loop' | 'out_and_back' | 'point_to_point'
  operator              text,
  network               text,
  bbox                  jsonb,
  geometry_simplified   jsonb,            -- [lat,lon][] campionati ogni ~200m
  data_quality          text NOT NULL,    -- 'osm_tags' | 'calculated' | 'estimated'
  description           text,
  from_label            text,
  to_label              text,
  ref                   text,
  cai_scale             text,
  source                text DEFAULT 'osm',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trails_osm_relation_id ON trails (osm_relation_id);


-- ── Security Index (SI) + Sentinel-2 enrichment ───────────────────────────────
-- Stesso blocco di supabase/migrations/add_si_sentinel2_columns.sql, qui per
-- coerenza con la convenzione di questo file (ALTER dopo il CREATE TABLE).
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_score int;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_label text;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_signals jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_static_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_dynamic_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_satellite_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_ground_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS is_ghost_trail boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dominant_warning text;

ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_ndvi_monthly jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_ndvi_delta float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_ndwi_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_nbr_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_evi_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_bsi_current float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_fire_detected boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_flood_detected boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_landslide_risk boolean DEFAULT false;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_shade_score float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_landscape_variety float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_water_sources jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_phenology_peak_month int;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_computed_at timestamptz;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS s2_available boolean DEFAULT false;


-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 1 (PAI)
-- Stesso blocco anche in supabase/migrations/add_pai_tables.sql
-- ═══════════════════════════════════════════════════════════

-- ── Cache poligoni PAI (rischio idrogeologico ufficiale) ──────────────────────
-- bbox-keyed, stesso pattern lazy-cleanup di poi_cache (app/api/pois/route.ts) —
-- TTL lungo (90gg, gestito lato applicativo) perché i piani di bacino cambiano
-- su scala di anni, non vale ri-interrogare il WFS ad ogni calcolo SI.
-- source_authority non è una colonna qui: ogni feature in `features` porta già
-- il proprio sourceAuthority (vedi PaiFeature in lib/pai/paiClient.ts), dato che
-- un singolo bbox può attraversare più Autorità di Bacino.
CREATE TABLE IF NOT EXISTS pai_polygon_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  features      jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pai_polygon_cache_expires_at ON pai_polygon_cache (expires_at);

-- ── Backfill: ptpr_pois (drift preesistente, mai documentata in questo file) ──
-- Usata da app/api/pois/route.ts (fetchPtprPois) e popolata da scripts/import-ptpr.ts;
-- la tabella esiste già nel progetto Supabase live — CREATE TABLE IF NOT EXISTS è
-- un no-op lì, serve solo a far smettere questo file di mentire sullo schema reale.
CREATE TABLE IF NOT EXISTS ptpr_pois (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id     text,
  name          text,
  description   text,
  poi_type      text NOT NULL,
  layer         text NOT NULL,
  lat           float8 NOT NULL,
  lon           float8 NOT NULL,
  region        text NOT NULL,
  raw_props     jsonb,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (source_id, layer)
);

CREATE INDEX IF NOT EXISTS idx_ptpr_pois_lat_lon ON ptpr_pois (lat, lon);


-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 2 (PSInSAR)
-- Stesso blocco anche in supabase/migrations/add_psinsar_tables.sql
-- ═══════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 3 (DTM, ora TINITALY/INGV — vedi
-- lib/geo/datasetConfig.ts's DTM_DATASET per il pivot dal LiDAR 1m PST-A)
-- Stesso blocco anche in supabase/migrations/add_dtm_columns.sql
--
-- Schema-only in questa fase: nessun codice applicativo legge/scrive
-- ancora queste colonne (vedi lib/dtm/trailDtmProfile.ts, ricalcolato
-- ad ogni CTS via /api/tei-dtm, stesso schema "nessuna persistenza" di
-- /api/tei-overpass). dtm_track_hash invece di un TTL temporale: un
-- rilievo DTM non cambia nel tempo a parità di traccia, l'invalidazione
-- naturale è un hash della traccia densa, non una scadenza.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;


-- ═══════════════════════════════════════════════════════════
-- Meteo storico al momento dell'escursione (Blocco 1.2 piano DTrek)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE activities ADD COLUMN IF NOT EXISTS weather_at_hike jsonb;


-- ═══════════════════════════════════════════════════════════
-- Velocità di crociera netta (Blocco 1.3 piano DTrek)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE activities ADD COLUMN IF NOT EXISTS net_speed_ms double precision;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS pause_time_seconds double precision;


-- ═══════════════════════════════════════════════════════════
-- IEV — Indice Efficienza Verticale (Blocco 5.1 piano DTrek)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE activities ADD COLUMN IF NOT EXISTS iev double precision;


-- ═══════════════════════════════════════════════════════════
-- Editor resoconto strutturato (Blocco 7.1 piano DTrek)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE hike_reports ADD COLUMN IF NOT EXISTS authored_by TEXT DEFAULT 'ai';
ALTER TABLE hike_reports ADD COLUMN IF NOT EXISTS sections JSONB;


-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 4 (Geologia CARG + Uso del suolo)
-- Stesso blocco anche in supabase/migrations/add_geologia_usosuolo_tables.sql
-- ═══════════════════════════════════════════════════════════

-- ── Cache geologia (litologia CARG, per-punto via WMS GetFeatureInfo) ─────────
-- point_key (non bbox_key): GetFeatureInfo risponde per un singolo punto, non
-- un'area — stesso rounding a 2 decimali (~1km) di normalizeBboxKey, riusato su
-- "lat,lon" invece che su un bbox a 4 valori. feature può essere JSON null
-- (nessun dato litologico in quel punto) — stesso stato cacheable di un array
-- vuoto in pai_polygon_cache. TTL lungo (180gg): la litologia non cambia nel
-- tempo a parità di punto.
CREATE TABLE IF NOT EXISTS geologia_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  point_key     text NOT NULL UNIQUE,
  feature       jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geologia_cache_expires_at ON geologia_cache (expires_at);

-- ── Cache uso del suolo (land-cover, bbox-keyed via WCS GetCoverage) ──────────
-- tile serializza UsoSuoloTile con classCodes come number[] (jsonb non supporta
-- TypedArray) — vedi lib/usosuolo/usoSuoloCache.ts per il round-trip. TTL più
-- corto (30gg) di PAI/geologia: il land cover cambia su scala stagionale/
-- annuale (incendi, disboscamento, stagioni), non pluriennale.
CREATE TABLE IF NOT EXISTS uso_suolo_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  tile          jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uso_suolo_cache_expires_at ON uso_suolo_cache (expires_at);


-- ═══════════════════════════════════════════════════════════
-- Geoportale Nazionale MASE/ISPRA — Fase 5 (Rete Natura 2000)
-- Stesso blocco anche in supabase/migrations/add_natura2000_tables.sql
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

-- ═══════════════════════════════════════════════════════════
-- Galleria Verde / Galleria Selvatica — fallback multi-fonte (licenze commerciali)
-- Stesso blocco è anche presente in supabase/migrations/add_species_gallery_tables.sql.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS species_image_fallback (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scientific_name text NOT NULL UNIQUE,
  wikidata_qid    text,
  image_url       text,
  license         text NOT NULL DEFAULT 'CC0',
  fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS n2000_site_species (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_code           text NOT NULL,
  scientific_name     text NOT NULL,
  vernacular_name_it  text,
  taxon_group         text,
  annex_code          text,
  source              text NOT NULL DEFAULT 'eea',
  license             text NOT NULL DEFAULT 'CC-BY-4.0',
  imported_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_code, scientific_name)
);

CREATE INDEX IF NOT EXISTS idx_n2000_species_site ON n2000_site_species (site_code);

CREATE TABLE IF NOT EXISTS gallery_cascade_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL,
  gallery_type  text NOT NULL,
  month         smallint NOT NULL,
  fallback_level smallint NOT NULL,
  items         jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  UNIQUE (bbox_key, gallery_type, month)
);

CREATE INDEX IF NOT EXISTS idx_gallery_cascade_cache_expires_at ON gallery_cascade_cache (expires_at);


-- ── Foto delle escursioni (persistenza server, sostituisce localStorage) ──────
-- Le immagini vivono nel bucket Storage 'dtrek-photos' (path ${userId}/${activityId}/${photoId}.jpg);
-- questa tabella salva solo URL + metadati, stesso pattern di hike_reports/dtrek-reports.
CREATE TABLE IF NOT EXISTS activity_photos (
  id            TEXT PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id   TEXT NOT NULL,
  url           TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  caption       TEXT NOT NULL DEFAULT '',
  progress      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  has_exif_gps  BOOLEAN NOT NULL DEFAULT false,
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_photos_activity_id ON activity_photos (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_photos_user_id     ON activity_photos (user_id);

ALTER TABLE activity_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_photos_owner" ON activity_photos;
CREATE POLICY "activity_photos_owner"
  ON activity_photos FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Supabase Storage bucket per le foto delle escursioni ──────────────────────
-- Esegui nel SQL Editor di Supabase:
--
-- INSERT INTO storage.buckets (id, name, public)
--   VALUES ('dtrek-photos', 'dtrek-photos', true)
--   ON CONFLICT (id) DO NOTHING;
--
-- DROP POLICY IF EXISTS "users_write_own_photos" ON storage.objects;
-- CREATE POLICY "users_write_own_photos" ON storage.objects
--   FOR INSERT WITH CHECK (
--     auth.uid()::text = (storage.foldername(name))[1]
--     AND bucket_id = 'dtrek-photos'
--   );
--
-- DROP POLICY IF EXISTS "users_update_own_photos" ON storage.objects;
-- CREATE POLICY "users_update_own_photos" ON storage.objects
--   FOR UPDATE USING (
--     auth.uid()::text = (storage.foldername(name))[1]
--     AND bucket_id = 'dtrek-photos'
--   );
--
-- DROP POLICY IF EXISTS "users_delete_own_photos" ON storage.objects;
-- CREATE POLICY "users_delete_own_photos" ON storage.objects
--   FOR DELETE USING (
--     auth.uid()::text = (storage.foldername(name))[1]
--     AND bucket_id = 'dtrek-photos'
--   );
--
-- DROP POLICY IF EXISTS "public_read_photos" ON storage.objects;
-- CREATE POLICY "public_read_photos" ON storage.objects
--   FOR SELECT USING (bucket_id = 'dtrek-photos');


-- ═══════════════════════════════════════════════════════════
-- MIGRAZIONE DATI ESISTENTI
-- Esegui DOPO aver creato il tuo account su DTrek.
-- Sostituisci 'INCOLLA-QUI-IL-TUO-UUID' con il tuo user_id
-- (visibile in Supabase → Authentication → Users)
-- ═══════════════════════════════════════════════════════════
-- UPDATE activities    SET user_id = 'INCOLLA-QUI-IL-TUO-UUID' WHERE user_id IS NULL;
-- UPDATE planned_hikes SET user_id = 'INCOLLA-QUI-IL-TUO-UUID' WHERE user_id IS NULL;
