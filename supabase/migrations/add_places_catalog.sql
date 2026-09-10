-- ═══════════════════════════════════════════════════════════
-- Piano mete multi-tipologia (docs/piano-mete-multitipologia.md §3, §12, §13 —
-- Blocco B, Places Engine). Catalogo geografico indipendente da planned_hikes
-- (piano §3: "Non usare planned_hikes come database generale dei luoghi"),
-- alimentato da una pipeline ETL offline (scripts/places/) e MAI da query live
-- per-utente — vedi piano §21 ("Non usare AI come motore anagrafico") e §9
-- ("Non effettuare Overpass live come motore principale della ricerca").
--
-- Tabella di riferimento pubblica, non user-owned — stesso pattern di
-- `trails`/`ptpr_pois` (RLS + policy di sola lettura pubblica, scritta solo
-- dal client service-role che bypassa la RLS, vedi
-- supabase/migrations/enable_rls_public_cache_tables.sql).
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── dtrek_places ──────────────────────────────────────────────────────────────
-- Una Meta Borgo/Città o Sito deduplicata (piano §14) tra le fonti che la
-- descrivono. `geometry` è opzionale oltre a latitude/longitude: per un centro
-- storico (piano §7) può essere un poligono, non solo un punto — il trigger
-- sotto valorizza un Point da lat/lon SOLO quando il chiamante non ha già
-- fornito una geometria propria (es. il perimetro del centro storico).
--
-- `source`/`source_id`/`confidence` qui sono la fonte "primaria" che ha
-- originato la riga (upsert idempotente su ri-esecuzione della pipeline);
-- TUTTE le fonti che confermano la stessa Meta deduplicata vivono in
-- dtrek_place_sources sotto, una riga per fonte.
CREATE TABLE IF NOT EXISTS dtrek_places (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,

  meta_type               text NOT NULL CHECK (meta_type IN ('sentiero', 'borgo_citta', 'sito')),
  -- Per meta_type='sito': uno dei SiteType di lib/metaTypes.ts (museo, castello, ...).
  -- Per meta_type='borgo_citta': 'borgo' | 'citta' (piano §6, place_category — mai dedotto da
  -- Comune=Borgo, vedi classificazione Dtrek separata da ISTAT). NULL per 'sentiero': i sentieri
  -- non sono ancora popolati in questo catalogo dalla pipeline attuale (restano in trails/OSM,
  -- vedi piano §18 "mantenere il sistema attuale").
  subtype                 text,

  description             text,

  latitude                double precision NOT NULL,
  longitude               double precision NOT NULL,
  geometry                geometry(Geometry, 4326),

  region                  text,
  province                text,
  municipality            text,
  municipality_istat_code text,
  address                 text,

  image_url               text,
  official_url            text,
  website                 text,
  opening_hours           jsonb,

  source                  text NOT NULL,
  source_id               text NOT NULL,
  confidence               double precision NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),

  -- Knowledge layer opzionale (piano §11) — mai obbligatorio, mai fonte primaria dell'anagrafe.
  wikidata_id              text,

  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  last_verified_at          timestamptz,

  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_dtrek_places_geometry     ON dtrek_places USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_dtrek_places_meta_type    ON dtrek_places (meta_type);
CREATE INDEX IF NOT EXISTS idx_dtrek_places_subtype      ON dtrek_places (subtype);
CREATE INDEX IF NOT EXISTS idx_dtrek_places_municipality_istat_code ON dtrek_places (municipality_istat_code);
CREATE INDEX IF NOT EXISTS idx_dtrek_places_region        ON dtrek_places (region);
CREATE INDEX IF NOT EXISTS idx_dtrek_places_lat_lon        ON dtrek_places (latitude, longitude);

-- Point(lon, lat) automatico da latitude/longitude quando il chiamante non passa già una
-- geometria propria (poligono di centro storico, area turistica) — vedi piano §7.
CREATE OR REPLACE FUNCTION dtrek_places_set_geometry_from_latlon() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.geometry IS NULL THEN
    NEW.geometry := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dtrek_places_set_geometry ON dtrek_places;
CREATE TRIGGER trg_dtrek_places_set_geometry
  BEFORE INSERT OR UPDATE ON dtrek_places
  FOR EACH ROW EXECUTE FUNCTION dtrek_places_set_geometry_from_latlon();

-- Riusa set_updated_at() già definita in supabase/migrations/add_updated_at_tracking.sql.
DROP TRIGGER IF EXISTS trg_dtrek_places_updated_at ON dtrek_places;
CREATE TRIGGER trg_dtrek_places_updated_at
  BEFORE UPDATE ON dtrek_places
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dtrek_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtrek_places_public_read" ON dtrek_places;
CREATE POLICY "dtrek_places_public_read" ON dtrek_places FOR SELECT USING (true);

-- ── dtrek_place_sources ──────────────────────────────────────────────────────
-- Tutte le fonti che confermano la STESSA Meta deduplicata (piano §12) —
-- "Castello X" può avere righe MiC/OSM/Wikidata/PTPR qui, una sola riga in
-- dtrek_places. Un candidato con confidence bassa (piano §14, "match incerti
-- NON devono essere automaticamente fusi") NON produce una riga qui: resta
-- una dtrek_places separata finché non viene confermato manualmente.
CREATE TABLE IF NOT EXISTS dtrek_place_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id       uuid NOT NULL REFERENCES dtrek_places(id) ON DELETE CASCADE,

  source         text NOT NULL,
  source_id      text NOT NULL,
  source_url     text,
  raw_type       text,

  confidence     double precision NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  last_synced_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_dtrek_place_sources_place_id ON dtrek_place_sources (place_id);

ALTER TABLE dtrek_place_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtrek_place_sources_public_read" ON dtrek_place_sources;
CREATE POLICY "dtrek_place_sources_public_read" ON dtrek_place_sources FOR SELECT USING (true);

-- ── dtrek_place_relations ────────────────────────────────────────────────────
-- Relazioni tra Mete (piano §13) — es. "Viterbo contains Palazzo dei Papi".
-- Fondamentale per la generazione di itinerari (piano §26), non ancora usata
-- in questo blocco (Places Engine): la sola struttura dati, popolata da un
-- blocco successivo (Experience/Search) quando esisteranno candidati reali.
CREATE TABLE IF NOT EXISTS dtrek_place_relations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_place_id uuid NOT NULL REFERENCES dtrek_places(id) ON DELETE CASCADE,
  to_place_id   uuid NOT NULL REFERENCES dtrek_places(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('contains', 'located_in', 'part_of', 'near', 'associated_with')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (from_place_id, to_place_id, relation_type),
  CHECK (from_place_id <> to_place_id)
);

CREATE INDEX IF NOT EXISTS idx_dtrek_place_relations_from ON dtrek_place_relations (from_place_id);
CREATE INDEX IF NOT EXISTS idx_dtrek_place_relations_to   ON dtrek_place_relations (to_place_id);

ALTER TABLE dtrek_place_relations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtrek_place_relations_public_read" ON dtrek_place_relations;
CREATE POLICY "dtrek_place_relations_public_read" ON dtrek_place_relations FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
