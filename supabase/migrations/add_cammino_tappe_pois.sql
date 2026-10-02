-- Piano Cammini, Fase 5: luoghi lungo ogni tappa (OSM, via Overpass), calcolati al primo bisogno e
-- messi in cache — le tappe sono dato di catalogo, uguale per tutti gli utenti. Idempotente.
ALTER TABLE dtrek_cammino_tappe
  ADD COLUMN IF NOT EXISTS pois    jsonb,
  ADD COLUMN IF NOT EXISTS pois_at timestamptz;
