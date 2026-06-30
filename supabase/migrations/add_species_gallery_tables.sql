-- ═══════════════════════════════════════════════════════════
-- Galleria Verde / Galleria Selvatica — fallback multi-fonte (licenze commerciali)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

-- ── Cache immagine di riserva Wikidata/Commons (sempre CC0) ───────────────────
-- Usata da /api/flora e /api/animals quando GBIF/iNaturalist non hanno una foto
-- per la specie. Una riga per nome scientifico, niente TTL: le foto Commons di
-- una specie non cambiano di settimana in settimana.
CREATE TABLE IF NOT EXISTS species_image_fallback (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scientific_name text NOT NULL UNIQUE,
  wikidata_qid    text,
  image_url       text,
  license         text NOT NULL DEFAULT 'CC0',
  fetched_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Specie per sito Natura 2000, fonte EEA (CC BY 4.0) — NON MASE ─────────────
-- site_code corrisponde a Natura2000Feature.siteCode già restituito da
-- /api/natura2000 (geometrie MASE, usate solo per l'intersezione bbox/track,
-- mai per la lista specie). Import offline una tantum da scripts/import-n2000-species.ts.
CREATE TABLE IF NOT EXISTS n2000_site_species (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_code           text NOT NULL,
  scientific_name     text NOT NULL,
  vernacular_name_it  text,
  taxon_group         text,            -- 'Mammals' | 'Birds' | 'Reptiles' | 'Amphibians' | 'Plants' | 'Invertebrates'
  annex_code          text,
  source              text NOT NULL DEFAULT 'eea',
  license             text NOT NULL DEFAULT 'CC-BY-4.0',
  imported_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_code, scientific_name)
);

CREATE INDEX IF NOT EXISTS idx_n2000_species_site ON n2000_site_species (site_code);

-- ── Cache cascata galleria, bbox-keyed (stesso pattern di natura2000_cache) ────
-- Evita di rieseguire l'intera cascata GBIF→iNaturalist→buffer esteso→Natura2000
-- ogni volta che si apre la stessa scheda escursione. TTL corto (7gg): a
-- differenza dei poligoni Natura2000, le osservazioni di specie cambiano
-- stagionalmente (la query include già il mese, vedi bbox_key).
CREATE TABLE IF NOT EXISTS gallery_cascade_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bbox_key      text NOT NULL,
  gallery_type  text NOT NULL,        -- 'flora' | 'fauna'
  month         smallint NOT NULL,
  fallback_level smallint NOT NULL,   -- 1 = bbox diretto, 2 = buffer esteso, 3 = fallback Natura2000
  items         jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  UNIQUE (bbox_key, gallery_type, month)
);

CREATE INDEX IF NOT EXISTS idx_gallery_cascade_cache_expires_at ON gallery_cascade_cache (expires_at);
