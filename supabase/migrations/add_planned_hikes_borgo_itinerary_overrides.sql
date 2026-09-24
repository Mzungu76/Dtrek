-- ═══════════════════════════════════════════════════════════
-- Piano guide-eccellenza — Fase 2 personalizzazione itinerario Borgo/Città: verifica utente,
-- "voglio dare all'utente la possibilità di [...] spostare i poi da una tappa all'altra o di
-- 'spegnerlo' [...] Tutte le modifiche applicate dall'utente devono propagarsi negli itinerari.
-- In supabase generale [...] dovrebbero venire salvati gli itinerari e le tappe di default per
-- tutti gli utenti, mentre le personalizzazioni [...] dovrebbero venir salvate lato utente."
--
-- Colonna PER-UTENTE (planned_hikes, mai dtrek_places.itinerary_cache — quella resta condivisa
-- tra tutti gli utenti/guide dello stesso borgo). Mappa sparsa (BorgoItineraryOverrides, lib/
-- metaSearch/borgoItinerary.ts) indicizzata per id di tappa (ItineraryStopCandidate.id) — mai un
-- default duplicato per ogni punto, solo le voci che l'utente ha davvero cambiato:
--   { "<stopId>": { visitMinutes?: number, disabled?: boolean, tappaIndex?: number } }
--
-- - visitMinutes: slider dell'utente, sostituisce visitMinutesFor(stop) per quel punto.
-- - disabled: punto "spento" — escluso dal budget/raggruppamento ma mai rimosso dalla mappa
--   (semitrasparente, riattivabile).
-- - tappaIndex: spostamento manuale tra tappe — un pin che vince sul raggruppamento automatico.
--   Applicato SOLO dall'endpoint di ricalcolo reale (app/api/borgo-itinerary/apply-overrides/
--   route.ts, verifica utente: "ricalcolo reale al server quando l'utente conferma", mai una
--   linea d'aria istantanea lato client per questo campo).
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS borgo_itinerary_overrides JSONB;

NOTIFY pgrst, 'reload schema';
