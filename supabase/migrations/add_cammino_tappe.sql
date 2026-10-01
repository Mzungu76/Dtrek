-- ═══════════════════════════════════════════════════════════
-- Piano Cammini (docs/piano-cammini.md, Fase 2). Le tappe di un Cammino del catalogo
-- (dtrek_places.meta_type = 'cammino'). Segmenti di traccia reali in sequenza, non gruppi di
-- punti di visita come per un Borgo.
--
-- `polyline` è [lat, lon][] semplificato — lo stesso formato di planned_hikes.route_polyline —
-- non una geometria PostGIS: l'app lo consuma così com'è e PostgREST non scrive geometrie da JSON
-- in modo verificato in questo repository.
-- elevation_* restano NULL all'importazione: OSM non porta quote, il dislivello si calcola dopo
-- dal DTM (Fase 5) e un nuovo import NON li azzera (l'upsert scrive solo le colonne dell'ETL).
-- `source`: 'official' (tappe della fonte) o 'computed' (calcolate da noi a budget di giornata) —
-- la UI non deve mai spacciare le seconde per ufficiali.
-- Esegui nel Supabase SQL Editor (idempotente). Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dtrek_cammino_tappe (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cammino_id       uuid NOT NULL REFERENCES dtrek_places(id) ON DELETE CASCADE,
  ordinal          integer NOT NULL CHECK (ordinal >= 1),
  name             text NOT NULL,
  from_name        text,
  to_name          text,
  from_place_id    uuid REFERENCES dtrek_places(id) ON DELETE SET NULL,
  to_place_id      uuid REFERENCES dtrek_places(id) ON DELETE SET NULL,
  length_m         double precision NOT NULL CHECK (length_m >= 0),
  elevation_gain_m double precision,
  elevation_loss_m double precision,
  polyline         jsonb NOT NULL,
  source           text NOT NULL CHECK (source IN ('official', 'computed')),
  ends_at_anchor   boolean,
  osm_relation_id  bigint,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cammino_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_dtrek_cammino_tappe_cammino ON dtrek_cammino_tappe (cammino_id, ordinal);

DROP TRIGGER IF EXISTS trg_dtrek_cammino_tappe_updated_at ON dtrek_cammino_tappe;
CREATE TRIGGER trg_dtrek_cammino_tappe_updated_at
  BEFORE UPDATE ON dtrek_cammino_tappe
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dtrek_cammino_tappe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtrek_cammino_tappe_public_read" ON dtrek_cammino_tappe;
CREATE POLICY "dtrek_cammino_tappe_public_read" ON dtrek_cammino_tappe FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
