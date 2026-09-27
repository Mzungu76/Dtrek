-- ═══════════════════════════════════════════════════════════
-- Cache delle opere collegate a un museo su Wikidata (lib/museumOpere.ts,
-- app/api/places/[id]/route.ts) — docs/opere-musei-wikidata.md/docs/arco-opere-musei.md.
--
-- Verifica utente ("non puoi fare in modo che semplicemente alla creazione della guida di un
-- museo l'app fa la richiesta per quel museo e recupera i dati?"): invece di un import batch di
-- tutti i 2.296 musei già in Dtrek (impraticabile — ~0.15-1s per richiesta Wikidata, sequenziale,
-- una sessione manuale ha arricchito 28 musei in un lotto), l'arricchimento avviene DAL VIVO alla
-- prima apertura della Guida di QUEL museo specifico, con cache condivisa qui — stesso principio
-- già usato per itinerary_cache (add_dtrek_places_itinerary_cache.sql) e per
-- image_url/image_credit/image_checked_at (add_place_photo_cache_columns.sql).
--
-- Colonne su dtrek_places (il museo stesso), non altrove: le opere collegate dipendono solo dal
-- wikidata_id del museo, mai da quale utente/guida le sta chiedendo — utenti diversi che aprono la
-- guida dello stesso museo condividono la stessa cache invece di duplicarla.
--
-- opere_cache: array di { title, image?, creator?, year?, wikidataId } — mai un blob non
-- strutturato, sempre lo stesso formato restituito da lib/museumOpere.ts.
-- opere_cached_at: quando è stata calcolata — TTL di 90 giorni applicato in lettura (più lungo dei
-- 30 giorni di itinerary_cache: una collezione museale cambia molto più di rado di una rete
-- pedonale OSM). Un array vuoto è un esito valido e viene cachato come tale (a differenza di
-- itinerary_cache, dove un elenco vuoto può derivare da un fallimento silenzioso della geosearch:
-- qui "0 opere" è quasi sempre un fatto reale del museo, non un errore — vedi lib/museumOpere.ts).
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS opere_cache JSONB;
ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS opere_cached_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
