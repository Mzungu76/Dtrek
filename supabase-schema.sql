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

ALTER TABLE trail_difficulty_markers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trail_difficulty_markers_public_read" ON trail_difficulty_markers;
CREATE POLICY "trail_difficulty_markers_public_read" ON trail_difficulty_markers FOR SELECT USING (true);


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
-- When trail_score/linked_beauty_score were last computed — same staleness policy as
-- planned_hikes.cached_scores_computed_at, see lib/computeCtsForActivity.ts.
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS trail_score_computed_at TIMESTAMPTZ;

-- Biometric profile (replaces manual FCmax setting)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_age        INTEGER;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_weight_kg  DOUBLE PRECISION;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_height_cm  INTEGER;

CREATE INDEX IF NOT EXISTS idx_activities_loot_score  ON activities (loot_score  DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_activities_trail_score ON activities (trail_score DESC NULLS LAST);

-- TrailScore cache for planned hikes
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_trail_score             DOUBLE PRECISION;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_trail_score_confidence  TEXT;
-- When cached_trail_score/cached_beauty_score were last computed — drives the "recompute if
-- missing or older than 30 days" policy in lib/computeCtsForHike.ts / app/guida/GuidaHub.tsx.
-- Beauty is never tracked as its own score (it's purely CTS's input), so one timestamp covers both.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_scores_computed_at      TIMESTAMPTZ;

-- SafetyScore cache for planned hikes
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_safety_score JSONB;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_safety_computed_at TIMESTAMPTZ;

-- Trail Score (TS) v2 aggregate cache, 0-100 — see lib/trailScoreV2.ts. NOT a linear sum anymore
-- (that formula was replaced): Comfort TrailScore and Ombra e acqua combine into a "Value" (their
-- weights shift with forecast temperature), Sicurezza gates that Value via a sigmoid (non
-- compensabile — un rischio alto non si "recupera" con più bellezza), and Affidabilità (already
-- corrected for data density, see si_density_factor above) shrinks the result toward a neutral
-- prior when data quality is low. Computed once live while a hike is open (app/guida/GuidaHub.tsx),
-- then read back here so list/gallery views don't need to recompute from scratch on every load.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_ts_total DOUBLE PRECISION;

-- Trail Score v2 — stesse colonne di trasparenza di trails sopra.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_score_raw float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_density_factor float;

-- Stratigrafia temporale ("cosa vedresti da qui" per epoca) — vedi lib/epochPois.ts. Ogni voce
-- porta la propria epoca (etrusca/romana/medievale/oggi) e coordinate reali già note, così lo
-- slider epoca del navigatore filtra e mostra i testi senza bisogno di generazione in tempo
-- reale (funziona offline).
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_epoch_pois JSONB;

CREATE INDEX IF NOT EXISTS idx_planned_trail_score ON planned_hikes (cached_trail_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_planned_ts_total     ON planned_hikes (cached_ts_total    DESC NULLS LAST);

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

-- Indirizzo di partenza dell'utente (punto da cui parte per le escursioni), usato per
-- calcolare distanza/tempo di guida fino al punto di inizio dei percorsi pianificati
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS starting_address TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS starting_lat     DOUBLE PRECISION;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS starting_lon     DOUBLE PRECISION;

-- Cache di distanza/tempo di guida (auto) dal punto di partenza dell'utente al punto di
-- inizio del percorso pianificato — evita di richiamare il servizio di routing (OSRM) ad
-- ogni apertura della scheda. cached_driving_origin_lat/lon registrano da quale indirizzo
-- di partenza è stata calcolata la cache, per invalidarla se l'utente lo cambia.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_driving_distance_m   DOUBLE PRECISION;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_driving_duration_s   DOUBLE PRECISION;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_driving_origin_lat   DOUBLE PRECISION;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_driving_origin_lon   DOUBLE PRECISION;

-- Scadenza dei percorsi "in attesa" nel tab Guida — calcolata all'import da
-- guide_pending_days (user_settings), prorogabile o archiviabile manualmente.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS pending_expires_at TIMESTAMPTZ;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS archived_at        TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_planned_pending_expires ON planned_hikes (pending_expires_at ASC NULLS LAST);

-- Preferito nella galleria Guida — vedi components/routehub/BottomGallery.tsx (stella sulla scheda
-- chiusa) e app/guida/GuidaHub.tsx (filtro "Preferiti"). Era già scritto/letto dal codice ma non
-- era mai stato documentato qui né applicato al database (vedi supabase/migrations/
-- backfill_missing_planned_hikes_columns.sql) — ogni salvataggio falliva silenziosamente.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;

-- Scadenza predefinita (in giorni) applicata ai nuovi percorsi importati in Guida
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS guide_pending_days SMALLINT DEFAULT 30;

-- Livello della guida turistica generata (breve = automatica all'import, con testo AI solo
-- sulle sezioni scelte in guide_breve_sections; approfondita = generata su richiesta con
-- "Approfondisci", testo AI su tutte le sezioni). NULL con cached_guide già popolato indica
-- una guida generata prima di questa colonna (formato legacy, resa comunque leggibile).
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS guide_tier TEXT CHECK (guide_tier IN ('breve','approfondita'));
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS guide_generated_at TIMESTAMPTZ;

-- Sottotitolo da copertina scritto dall'AI al momento della generazione della guida (tag
-- [sottotitolo] nel prompt di app/api/guide/route.ts, estratto in lib/coverSubtitle.ts) — NULL
-- sulle guide generate prima di questa colonna o non ancora rigenerate.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_subtitle TEXT;

-- Avvisi sullo stato aggiornato del percorso (chiusure, deviazioni, lavori) trovati dalla ricerca
-- web di Giulia al momento della generazione della guida (tag [avviso] nel prompt di
-- app/api/guide/route.ts, estratto in lib/guideNotices.ts) — NULL/vuoto se nessuna criticità nota
-- o su guide generate prima di questa colonna.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_notices JSONB;

-- Fonti web citate da Giulia durante la generazione della guida (tag [fonti] nel prompt di
-- app/api/guide/route.ts, estratto in lib/guideSources.ts) — NULL/vuoto se la ricerca web non ha
-- prodotto citazioni o su guide generate prima di questa colonna.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_sources JSONB;

-- Sezioni (massimo 2) per cui la guida Breve genera testo AI — le altre restano solo-widget.
-- NULL/vuoto ⇒ default applicato lato server: prima_di_partire + il_percorso.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS guide_breve_sections TEXT[];

-- Profilo escursionista raccolto dal wizard di onboarding (app/components/onboarding) — usato
-- dalla valutazione di comfort AI nella ricerca percorsi con l'AI (vedi app/api/route-search/route.ts).
-- Facoltativo in ogni sua parte: NULL ⇒ l'utente non ha ancora completato/aperto il wizard.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_experience_level TEXT CHECK (hiker_experience_level IN ('principiante','intermedio','esperto'));
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_concerns TEXT[];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_environment_prefs TEXT[];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Storico aggregato delle escursioni completate (lib/hikerHistory.ts) — usato dalla sezione guida
-- "Su misura per te" (app/api/guide/route.ts) per confrontare un percorso programmato con le
-- capacità/abitudini reali dell'utente. Aggiornato in modo incrementale (somme + ultime 5 uscite,
-- non un ricalcolo completo) ad ogni escursione completata (Resoconto), con un backfill una tantum
-- da tutte le attività già esistenti la prima volta che serve e non c'è ancora nulla. NULL finché
-- non è mai stato calcolato.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_history_stats JSONB;

-- Pesi personalizzabili del TEI ("quanto ti importa" 0-100 per componente, vedi
-- normalizeTeiWeights in lib/tei.ts) — default = i pesi fissi storici (20/30/20/20/10), così un
-- utente che non tocca gli slider in Impostazioni ottiene lo stesso TEI di prima. Introdotti
-- perché il TEI trattava l'assenza di acqua/siti culturali come un difetto oggettivo invece che
-- come un gusto personale.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS tei_peso_cultura      SMALLINT DEFAULT 20;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS tei_peso_topografia   SMALLINT DEFAULT 30;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS tei_peso_idrografia   SMALLINT DEFAULT 20;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS tei_peso_fondo        SMALLINT DEFAULT 20;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS tei_peso_geodiversita SMALLINT DEFAULT 10;
-- Sensibilità alla penalità antropica (asfalto/elettrodotti/traffico) — 'normale' = comportamento
-- storico, a differenza dei pesi sopra questo non è "assenza = neutro" (vedi lib/tei.ts).
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS tei_f_antr_sensitivity TEXT DEFAULT 'normale' CHECK (tei_f_antr_sensitivity IN ('ignora','normale','fastidio'));

-- Modello Claude preferito per la generazione (guida, Chiedi a Giulia, confronto percorsi) —
-- vedi lib/claudeModels.ts. NULL = modello di default (DEFAULT_CLAUDE_MODEL), non un valore fisso
-- qui: l'elenco dei modelli disponibili è letto in diretta dalla Models API di Anthropic
-- (app/api/ai-models/route.ts), quindi il default può cambiare nel codice senza toccare lo schema.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS claude_model TEXT;

-- Consenso all'uso di dati personali nei prompt AI (guida, resoconto, questionario, confronto
-- percorsi) — 2 categorie separate, entrambe default ON/opt-out (scelta esplicita dell'utente,
-- vedi components/profilo/SectionAiPrivacy.tsx): ai_use_biometric_data copre età/sesso/frequenza
-- cardiaca/calorie (dati "particolari" ex art. 9 GDPR), ai_use_history_data copre storico percorsi/
-- preferenze/esperienza dichiarata. Lette in app/lib/guide/resolveApiKeyAndSettings.ts.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_use_biometric_data BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_use_history_data BOOLEAN NOT NULL DEFAULT true;

-- Consenso alla ricerca web di Giulia (sezione "Verificato online" della guida, "Chiedi a Giulia") —
-- default ON/opt-out, stesso pattern sopra. NON copre app/api/route-search/route.ts: lì la ricerca
-- web è il motore stesso della funzione, non un extra disattivabile.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_web_search BOOLEAN NOT NULL DEFAULT true;

-- Lunghezza del testo AI scelta dall'utente per ciascuna sezione della guida (essenziale /
-- approfondita / molto_approfondita — vedi lib/guideSections.ts's GuideTextLength). JSONB perché
-- è una mappa sezione→valore, non un elenco come guide_breve_sections. NULL/chiave assente ⇒
-- 'essenziale' per quella sezione (vedi sanitizeSectionLengths), il comportamento generato da sempre.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS guide_section_lengths JSONB;

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


-- ── Cronologia domande a Giulia ("Chiedi a Giulia" dentro un percorso) ────────
-- Una riga per domanda/risposta (vedi app/api/guide/qa/route.ts) — non un array JSONB su
-- planned_hikes, così la history cresce senza dover riscrivere l'intera riga del percorso.
CREATE TABLE IF NOT EXISTS guide_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_hike_id TEXT REFERENCES planned_hikes(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  pertinent       BOOLEAN NOT NULL DEFAULT true,
  sources         JSONB NOT NULL DEFAULT '[]',  -- [{url, title}] citate da Claude in questa risposta
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guide_questions_planned_hike ON guide_questions (planned_hike_id, created_at);
CREATE INDEX IF NOT EXISTS idx_guide_questions_user_id      ON guide_questions (user_id);

ALTER TABLE guide_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guide_questions_owner" ON guide_questions;
CREATE POLICY "guide_questions_owner"
  ON guide_questions FOR ALL
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

-- Trail Score v2 (supabase/migrations/add_trailscore_v2_columns.sql) — si_score è già corretto
-- per densità dati (lib/cl/signals/densitySignal.ts); si_score_raw/si_density_factor sono solo
-- per trasparenza/debug, nessuna logica di ricalcolo dipende da loro.
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_score_raw float;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS si_density_factor float;

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

-- ── Indici per la ricerca "Cerca in quest'area" (sezione Esplora) ────────────
-- Stesso blocco anche in supabase/migrations/add_trails_search_indexes.sql.
-- Il percorso principale filtra per lista esatta di osm_relation_id (già
-- coperto da idx_trails_osm_relation_id, nessun PostGIS necessario); questi
-- due indici servono solo per future interrogazioni dirette della cache.
CREATE INDEX IF NOT EXISTS idx_trails_route_type  ON trails (route_type);
CREATE INDEX IF NOT EXISTS idx_trails_distance_km ON trails (distance_km);


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

ALTER TABLE pai_polygon_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pai_polygon_cache_public_read" ON pai_polygon_cache;
CREATE POLICY "pai_polygon_cache_public_read" ON pai_polygon_cache FOR SELECT USING (true);

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
-- planned_hikes.dtm_profile/dtm_track_hash/dtm_computed_at sono lette/scritte da
-- app/guida/useDtmProfile.ts (via PATCH /api/planned): al primo open che calcola con successo
-- il profilo, il risultato viene persistito; alle aperture successive si legge da qui invece di
-- richiamare /api/tei-dtm, finché dtm_track_hash coincide con l'hash della traccia corrente
-- (lib/geoUtils.ts hashTrack) — nessun TTL temporale: un rilievo DTM non cambia nel tempo a
-- parità di traccia. Le colonne gemelle su `trails` (cache condivisa per traccia OSM, tra
-- utenti diversi che percorrono lo stesso sentiero) restano invece schema-only per ora.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_profile jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS dtm_computed_at timestamptz;


-- ═══════════════════════════════════════════════════════════
-- Profilo terreno (uso del suolo + geologia lungo la traccia) — persistenza per-escursione,
-- stesso pattern del blocco DTM sopra. Stesso blocco anche in
-- supabase/migrations/add_terrain_columns.sql. Lette/scritte da app/guida/useTerrainProfile.ts
-- (via PATCH /api/planned); terrain_track_hash (lib/geoUtils.ts hashTrack) al posto di un TTL
-- temporale, per lo stesso motivo del DTM: il terreno non cambia nel tempo a parità di traccia.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_profile jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS terrain_computed_at timestamptz;


-- ═══════════════════════════════════════════════════════════
-- Check area protetta (Rete Natura 2000) — persistenza per-escursione del solo booleano
-- risultato, stesso pattern dei blocchi DTM/terreno sopra. Stesso blocco anche in
-- supabase/migrations/add_protected_area_columns.sql. Lette/scritte da
-- app/guida/useProtectedAreaCheck.ts (via PATCH /api/planned); il poligono Natura 2000 è già
-- cacheato per bbox (natura2000_cache, TTL 270gg) — questa colonna evita comunque la fetch +
-- scansione point-in-polygon sulla traccia ad ogni apertura, invarianti quanto la traccia stessa
-- (cached_protected_area_track_hash, lib/geoUtils.ts hashTrack).
-- ═══════════════════════════════════════════════════════════
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_in_protected_area boolean;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_protected_area_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_protected_area_computed_at timestamptz;


-- ═══════════════════════════════════════════════════════════
-- Flora lungo la traccia — persistenza per-escursione, stesso pattern dei blocchi sopra. Stesso
-- blocco anche in supabase/migrations/add_flora_columns.sql. Lette/scritte da lib/useFlora.ts
-- (via PATCH /api/planned) quando chiamato con un plannedId; flora_track_hash (lib/geoUtils.ts
-- hashTrack) al posto di un TTL temporale.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_result jsonb;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS flora_computed_at timestamptz;


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

-- ── Cache DTM (OpenTopography Global DEM, bbox-keyed) ─────────────────────────
-- Stesso blocco anche in supabase/migrations/add_dtm_cache.sql. tile serializza
-- DtmTile con elevations come number[] (jsonb non supporta TypedArray) — vedi
-- lib/dtm/dtmCache.ts per il round-trip. TTL lungo (180gg): il terreno non
-- cambia nel tempo a parità di bbox.
CREATE TABLE IF NOT EXISTS dtm_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL UNIQUE,
  tile          jsonb,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dtm_cache_expires_at ON dtm_cache (expires_at);

ALTER TABLE dtm_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtm_cache_public_read" ON dtm_cache;
CREATE POLICY "dtm_cache_public_read" ON dtm_cache FOR SELECT USING (true);


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
-- RLS SU TABELLE DI CACHE/RIFERIMENTO PUBBLICHE (supabase/migrations/enable_rls_public_cache_tables.sql)
-- Nessun dato per-utente: sola lettura pubblica, scrittura solo via client service-role
-- (che bypassa comunque RLS) — chiude la scrittura diretta via PostgREST con la anon key.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE gallery_cascade_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE geologia_cache         ENABLE ROW LEVEL SECURITY;
ALTER TABLE n2000_site_species     ENABLE ROW LEVEL SECURITY;
ALTER TABLE natura2000_cache       ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi_cache              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ptpr_pois              ENABLE ROW LEVEL SECURITY;
ALTER TABLE species_image_fallback ENABLE ROW LEVEL SECURITY;
ALTER TABLE trails                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE uso_suolo_cache        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery_cascade_cache_public_read" ON gallery_cascade_cache;
CREATE POLICY "gallery_cascade_cache_public_read" ON gallery_cascade_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "geologia_cache_public_read" ON geologia_cache;
CREATE POLICY "geologia_cache_public_read" ON geologia_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "n2000_site_species_public_read" ON n2000_site_species;
CREATE POLICY "n2000_site_species_public_read" ON n2000_site_species FOR SELECT USING (true);

DROP POLICY IF EXISTS "natura2000_cache_public_read" ON natura2000_cache;
CREATE POLICY "natura2000_cache_public_read" ON natura2000_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "poi_cache_public_read" ON poi_cache;
CREATE POLICY "poi_cache_public_read" ON poi_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "ptpr_pois_public_read" ON ptpr_pois;
CREATE POLICY "ptpr_pois_public_read" ON ptpr_pois FOR SELECT USING (true);

DROP POLICY IF EXISTS "species_image_fallback_public_read" ON species_image_fallback;
CREATE POLICY "species_image_fallback_public_read" ON species_image_fallback FOR SELECT USING (true);

DROP POLICY IF EXISTS "trails_public_read" ON trails;
CREATE POLICY "trails_public_read" ON trails FOR SELECT USING (true);

DROP POLICY IF EXISTS "uso_suolo_cache_public_read" ON uso_suolo_cache;
CREATE POLICY "uso_suolo_cache_public_read" ON uso_suolo_cache FOR SELECT USING (true);


-- ═══════════════════════════════════════════════════════════
-- Timestamp di aggiornamento per la verifica di freschezza cache locale
-- (IndexedDB) vs Supabase — vedi lib/sync/pullEngine.ts. Stesso blocco anche
-- in supabase/migrations/add_updated_at_tracking.sql. Il trigger rende
-- updated_at automatico e impossibile da dimenticare su tutte e sei le
-- tabelle sincronizzate localmente (le tre prime non l'avevano affatto; le
-- altre tre lo avevano solo quando il codice applicativo lo impostava a mano).
-- ═══════════════════════════════════════════════════════════
ALTER TABLE activities      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE planned_hikes   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_activities_updated_at    ON activities (updated_at);
CREATE INDEX IF NOT EXISTS idx_planned_hikes_updated_at ON planned_hikes (updated_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_updated_at ON activities;
CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_planned_hikes_updated_at ON planned_hikes;
CREATE TRIGGER trg_planned_hikes_updated_at
  BEFORE UPDATE ON planned_hikes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_activity_photos_updated_at ON activity_photos;
CREATE TRIGGER trg_activity_photos_updated_at
  BEFORE UPDATE ON activity_photos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hike_reports_updated_at ON hike_reports;
CREATE TRIGGER trg_hike_reports_updated_at
  BEFORE UPDATE ON hike_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hike_questionnaires_updated_at ON hike_questionnaires;
CREATE TRIGGER trg_hike_questionnaires_updated_at
  BEFORE UPDATE ON hike_questionnaires
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════
-- Preferito nella galleria Resoconto — stesso blocco anche in
-- supabase/migrations/add_activities_favorite_column.sql. Stesso concetto già esistente per
-- planned_hikes (vedi colonna "favorite" più sopra), ora replicato per le escursioni concluse.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE activities ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;


-- ═══════════════════════════════════════════════════════════
-- MIGRAZIONE DATI ESISTENTI
-- Esegui DOPO aver creato il tuo account su DTrek.
-- Sostituisci 'INCOLLA-QUI-IL-TUO-UUID' con il tuo user_id
-- (visibile in Supabase → Authentication → Users)
-- ═══════════════════════════════════════════════════════════
-- UPDATE activities    SET user_id = 'INCOLLA-QUI-IL-TUO-UUID' WHERE user_id IS NULL;
-- UPDATE planned_hikes SET user_id = 'INCOLLA-QUI-IL-TUO-UUID' WHERE user_id IS NULL;
