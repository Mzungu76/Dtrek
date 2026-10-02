-- Piano Cammini, Fase E: servizi lungo ogni tappa (acqua, cibo, negozi, alloggi, trasporti, farmacie; OSM via
-- Overpass), calcolati al primo bisogno e messi in cache come i luoghi. Idempotente.
ALTER TABLE dtrek_cammino_tappe
  ADD COLUMN IF NOT EXISTS services    jsonb,
  ADD COLUMN IF NOT EXISTS services_at timestamptz;
