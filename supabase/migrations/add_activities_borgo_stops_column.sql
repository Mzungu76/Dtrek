-- ═══════════════════════════════════════════════════════════
-- Reportage di un Borgo/Città con i veri luoghi visitati (sessione conversazionale, seguito di
-- add_planned_hikes_borgo_walk_stops.sql): verificato che "Luoghi visitati" nel Reportage usava
-- una query Overpass generica entro 300m dalla traccia — identica a quella di un Sentiero, mai i
-- veri stop dell'itinerario curato a tappe (lib/metaSearch/borgoItinerary.ts).
--
-- borgo_stops è il "travaso" al momento del salvataggio (lib/activitySave.ts, stesso principio già
-- usato per guide_text/poi_wiki, add_activity_guide_columns.sql): solo gli stop di
-- planned_hikes.borgo_walk_stops vicini alla traccia di QUESTA uscita
-- (lib/borgoWalkPolyline.ts's visitedBorgoStops) — un Borgo su più tappe/giornate porta con sé solo
-- la tappa camminata in quella sessione, mai l'intero itinerario.
--
-- NULL per ogni attività che non è un Borgo/Città, non collegata a una Meta, o salvata prima di
-- questa colonna — in quel caso il Reportage ricade sul vecchio elenco Overpass (mai un pannello
-- vuoto per omissione).
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE activities ADD COLUMN IF NOT EXISTS borgo_stops jsonb;
