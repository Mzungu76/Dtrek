-- ═══════════════════════════════════════════════════════════
-- Indici additivi per la ricerca "Cerca in quest'area" della sezione Esplora
-- (vedi app/api/waymarked-trails/search/route.ts, lib/trailsCache.ts
-- getCachedTrailsInBbox). Il percorso principale filtra la cache `trails`
-- per lista esatta di osm_relation_id (già bbox-filtrati da Overpass a
-- monte), coperto dall'indice univoco esistente idx_trails_osm_relation_id
-- — nessun PostGIS/indice geospaziale necessario. Questi due indici btree
-- servono solo per future interrogazioni dirette della cache (es. "sentieri
-- ad anello già esplorati"), non sono richiesti dal flusso principale.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_trails_route_type  ON trails (route_type);
CREATE INDEX IF NOT EXISTS idx_trails_distance_km ON trails (distance_km);
