-- ═══════════════════════════════════════════════════════════
-- Cache dell'itinerario a piedi di un Borgo/Città (app/api/borgo-itinerary/route.ts) — verifica
-- utente: l'itinerario si ricalcolava da zero (geosearch Wikipedia + rete pedonale OSM + Dijkstra)
-- ad OGNI apertura della guida, anche per lo stesso borgo già visto poco prima, causando l'attesa
-- che ha fatto pensare "non vengono più generati gli itinerari".
--
-- Colonne su dtrek_places (il BORGO stesso), non su planned_hikes: l'itinerario dipende solo dalla
-- posizione del borgo (centro + tappe nel raggio), mai da QUALE utente/guida lo sta chiedendo —
-- utenti diversi che aprono la guida dello stesso borgo condividono la stessa cache invece di
-- duplicarla una volta per guida. Bounded: 6-8 tappe per borgo (MAX_STOPS in
-- app/api/borgo-itinerary/route.ts), qualche decina di KB anche per il borgo più visitato.
--
-- itinerary_cache: l'intero BorgoItinerary (stops con descrizioni estese + legs + totali) così
-- com'è restituito dall'endpoint — mai solo la polyline (quella resta borgo_walk_polyline su
-- planned_hikes, per il Navigator, invariata da questa migration).
-- itinerary_cached_at: quando è stata calcolata — TTL di 30 giorni applicato in lettura
-- dall'endpoint stesso (i dati sorgente, voci Wikipedia e rete pedonale OSM, cambiano di rado: un
-- mese di cache non produce quasi mai un dato percepibilmente vecchio).
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS itinerary_cache JSONB;
ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS itinerary_cached_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
