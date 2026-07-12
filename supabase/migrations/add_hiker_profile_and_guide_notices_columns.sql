-- ═══════════════════════════════════════════════════════════
-- Colonne dichiarate in supabase-schema.sql ma mai applicate al progetto Supabase live
-- (stesso pattern di dtm_cache/pai_polygon_cache/trail_difficulty_markers — SQL scritto,
-- mai eseguito manualmente nel SQL Editor). lib/hikerHistory.ts logga già da tempo un
-- sospetto esplicito su hiker_history_stats non migrata; questa migrazione lo conferma e
-- lo risolve, insieme al resto del blocco "profilo escursionista" (onboarding) e alle due
-- colonne di planned_hikes che lo accompagnavano.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

-- Scadenza predefinita (in giorni) applicata ai nuovi percorsi importati in Guida
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS guide_pending_days SMALLINT DEFAULT 30;

-- Profilo escursionista raccolto dal wizard di onboarding (app/components/onboarding) — usato
-- dalla valutazione di comfort AI nella ricerca percorsi con l'AI (vedi app/api/route-search/route.ts).
-- Facoltativo in ogni sua parte: NULL ⇒ l'utente non ha ancora completato/aperto il wizard.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_experience_level TEXT CHECK (hiker_experience_level IN ('principiante','intermedio','esperto'));
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_concerns TEXT[];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_environment_prefs TEXT[];
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Storico aggregato delle escursioni completate (lib/hikerHistory.ts) — usato dalla sezione guida
-- "Su misura per te" (app/api/guide/route.ts) per confrontare un percorso programmato con le
-- capacità/abitudini reali dell'utente. NULL finché non è mai stato calcolato (poi backfillato in
-- automatico alla prima lettura).
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hiker_history_stats JSONB;

-- Avvisi sullo stato aggiornato del percorso (chiusure, deviazioni, lavori) e fonti web citate da
-- Giulia durante la generazione della guida (tag [avviso]/[fonti] nel prompt di
-- app/api/guide/route.ts) — NULL/vuoto se nessuna criticità nota o su guide generate prima di
-- questa colonna.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_notices JSONB;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_sources JSONB;
