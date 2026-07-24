-- Colonne generate + indici per interrogare la cache `trails` per prossimità a un punto (centroide
-- "zona nota" dell'utente, vedi lib/routeBuilder/generateRecommendations.ts) — bbox è oggi solo
-- JSONB, senza indice geospaziale (vedi add_trails_search_indexes.sql). Nessun PostGIS: bastano
-- 4 colonne generate STORED + 2 indici btree per un test "punto dentro il bbox" indicizzato.
-- Le chiavi minLat/maxLat/minLon/maxLon corrispondono esattamente a come lib/trailsCache.ts scrive
-- la colonna bbox (upsertTrailCache).
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE trails ADD COLUMN IF NOT EXISTS bbox_min_lat DOUBLE PRECISION GENERATED ALWAYS AS ((bbox->>'minLat')::double precision) STORED;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS bbox_max_lat DOUBLE PRECISION GENERATED ALWAYS AS ((bbox->>'maxLat')::double precision) STORED;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS bbox_min_lon DOUBLE PRECISION GENERATED ALWAYS AS ((bbox->>'minLon')::double precision) STORED;
ALTER TABLE trails ADD COLUMN IF NOT EXISTS bbox_max_lon DOUBLE PRECISION GENERATED ALWAYS AS ((bbox->>'maxLon')::double precision) STORED;

CREATE INDEX IF NOT EXISTS idx_trails_bbox_lat ON trails (bbox_min_lat, bbox_max_lat);
CREATE INDEX IF NOT EXISTS idx_trails_bbox_lon ON trails (bbox_min_lon, bbox_max_lon);
