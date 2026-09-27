-- ═══════════════════════════════════════════════════════════
-- Reportage di un Borgo/Città con i veri luoghi visitati (sessione conversazionale, seguito di
-- add_planned_hikes_borgo_walk_tappa_ends.sql): verificato che "Luoghi visitati" nel Reportage
-- usava una query Overpass generica entro 300m dalla traccia — identica a quella di un Sentiero,
-- mai i veri stop dell'itinerario curato a tappe (lib/metaSearch/borgoItinerary.ts).
--
-- borgo_walk_stops porta l'intero elenco di stop dell'itinerario (nome, descrizione, immagine,
-- categoria — gli stessi campi già mostrati da BorgoTappeWidget nella Guida), non filtrato per
-- tappa qui: il filtro "quali sono quelli di QUESTA uscita" avviene al salvataggio dell'Attività
-- (lib/activitySave.ts's visitedBorgoStops, per prossimità reale alla traccia camminata — mai un
-- indice di tappa salvato, robusto a riordini manuali).
--
-- NULL per un itinerario non ancora calcolato o per ogni Meta salvata prima di questa colonna.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS borgo_walk_stops JSONB;

NOTIFY pgrst, 'reload schema';
