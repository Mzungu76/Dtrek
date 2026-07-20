-- ═══════════════════════════════════════════════════════════
-- Ricarica la cache dello schema di PostgREST — corregge un guasto reale in
-- produzione: activities.favorite (supabase/migrations/
-- add_activities_favorite_column.sql) e planned_hikes.favorite/
-- cached_in_protected_area erano state aggiunte alla tabella, ma PostgREST
-- non aveva mai ricaricato la propria cache dello schema, quindi ogni POST/
-- PATCH che referenziava quelle colonne falliva con PGRST204 "Could not
-- find the '<col>' column in the schema cache" — migliaia di scritture
-- fallite in silenzio (assorbite nell'outbox lato client, vedi
-- lib/blobStore.ts/lib/plannedStore.ts) per mesi prima che qualcuno se ne
-- accorgesse. activities non aveva nemmeno la colonna favorite creata
-- affatto in produzione (la migrazione esisteva nel repo ma non era mai
-- stata eseguita) — ri-applicata qui per idempotenza.
--
-- Esegui SEMPRE questo NOTIFY dopo qualunque ALTER TABLE su una tabella già
-- in uso — vedi anche il blocco equivalente in fondo a supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE activities ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
