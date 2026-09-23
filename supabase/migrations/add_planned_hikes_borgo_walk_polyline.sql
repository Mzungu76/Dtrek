-- ═══════════════════════════════════════════════════════════
-- Piano guide-eccellenza — verifica post-piano: l'itinerario a piedi reale di un Borgo/Città
-- (rete pedonale OSM via Dijkstra, app/api/borgo-itinerary/route.ts — le stesse `legs` già
-- disegnate su ItineraryMap in BorgoTappeWidget) deve poter essere usato anche dal Navigator per
-- una guida turno-per-turno sul campo, non solo mostrato su una mappa statica.
--
-- Colonna DEDICATA, mai route_polyline/track_points: quelle due restano il segnale con cui
-- lib/guideCardVariant.ts's borgoCardVariant() riconosce una VERA traccia GPS collegata
-- (variante 'trekking_misto', che sblocca Dati e sicurezza/Trail Score escursionistico — piano
-- guide-eccellenza §Fase 3/4). Un itinerario a piedi GENERATO dall'app tra i punti di interesse
-- di un Borgo 'cammino_urbano' non è quella cosa: scriverlo in route_polyline farebbe scattare
-- per errore quella classificazione. borgo_walk_polyline è letta SOLO dal Navigator (fallback
-- quando route_polyline è vuota) e mai da borgoCardVariant/metaEligibleForHikingScores.
--
-- Concatenazione in ordine di tutte le `legs[].polyline` di BorgoItinerary — [lat,lon] senza
-- quota (la rete pedonale OSM non la porta), coerente con un GPX senza elevazione: chi consuma
-- questo campo (ActiveNavigationView) già degrada senza profilo altimetrico in quel caso.
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS borgo_walk_polyline JSONB;
-- Hash della sequenza di tappe (id ordinati) da cui è stato calcolato — non un timestamp/TTL
-- temporale: l'itinerario a piedi tra le stesse tappe non cambia nel breve termine, stesso
-- principio già usato per dtm_track_hash/terrain_track_hash. Ricalcolato solo se le tappe
-- mostrate nel widget cambiano (nuova geosearch Wikipedia, nuovo import archivio).
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS borgo_walk_stops_hash TEXT;

NOTIFY pgrst, 'reload schema';
