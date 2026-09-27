-- ═══════════════════════════════════════════════════════════
-- Navigator "Modalità A" (sessione conversazionale, seguito di add_planned_hikes_borgo_walk_polyline.sql):
-- un Borgo/Città il cui contenuto richiede più tappe (mezza/una giornata non basta — vedi
-- lib/metaSearch/borgoItinerary.ts's groupStopsIntoTappe) veniva appiattito in un'unica polyline
-- continua una volta passato al Navigator — nessun modo di distinguere "fine tappa 1, si riprende
-- domani" da un cammino ininterrotto su più giorni.
--
-- Coordinate dell'ultimo punto di ogni tappa TRANNE l'ultima (lib/borgoWalkPolyline.ts's
-- computeBorgoWalkFields) — mai un confine fabbricato per la tappa finale, la cui fine coincide
-- già con la fine dell'intero percorso (stato 'finished' del motore di navigazione, nessun
-- segnale aggiuntivo necessario). lib/navigation/borgoTappaMoments.ts le trasforma in RouteMoment
-- 'tappa_end' per NavigationEngine — stesso meccanismo già usato per climb_start/viewpoint
-- (lib/navigation/routeMoments.ts), qui applicato a un confine semantico invece che morfologico.
--
-- NULL per un itinerario a tappa unica (il caso comune) o per ogni Meta salvata prima di questa
-- colonna — mai un confine fabbricato per omissione.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS borgo_walk_tappa_ends JSONB;

NOTIFY pgrst, 'reload schema';
