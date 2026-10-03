-- ═══════════════════════════════════════════════════════════
-- Piano Cammini — tracciati alternativi di una tappa (es. Via Francigena: una "Tappa 04 - Variante
-- - L'uscita da Chatillon" accanto alla Tappa 04 ufficiale). dtrek_cammino_tappe ha una riga sola
-- per (cammino_id, ordinal): qui va il percorso in più, non un'altra tappa della sequenza.
--
-- `tappa_ordinal` punta a dtrek_cammino_tappe.ordinal per lo stesso cammino, ma SENZA foreign key:
-- un re-import può rinumerare le tappe (la fonte stessa a volte ha filename e titolo sfasati — vedi
-- docs/piano-cammini.md §7.3), e una variante il cui aggancio non si ricostruisce con certezza resta
-- con tappa_ordinal NULL piuttosto che appesa a una tappa sbagliata.
-- `source_filename` identifica la variante in modo stabile tra un import e l'altro (upsert).
-- Esegui nel Supabase SQL Editor (idempotente). Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dtrek_cammino_tappe_varianti (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cammino_id       uuid NOT NULL REFERENCES dtrek_places(id) ON DELETE CASCADE,
  tappa_ordinal    integer CHECK (tappa_ordinal IS NULL OR tappa_ordinal >= 1),
  name             text NOT NULL,
  source_filename  text NOT NULL,
  length_m         double precision NOT NULL CHECK (length_m >= 0),
  polyline         jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cammino_id, source_filename)
);

CREATE INDEX IF NOT EXISTS idx_dtrek_cammino_tappe_varianti_cammino ON dtrek_cammino_tappe_varianti (cammino_id, tappa_ordinal);

DROP TRIGGER IF EXISTS trg_dtrek_cammino_tappe_varianti_updated_at ON dtrek_cammino_tappe_varianti;
CREATE TRIGGER trg_dtrek_cammino_tappe_varianti_updated_at
  BEFORE UPDATE ON dtrek_cammino_tappe_varianti
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dtrek_cammino_tappe_varianti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dtrek_cammino_tappe_varianti_public_read" ON dtrek_cammino_tappe_varianti;
CREATE POLICY "dtrek_cammino_tappe_varianti_public_read" ON dtrek_cammino_tappe_varianti FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
