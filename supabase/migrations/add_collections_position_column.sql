-- Estratta da supabase/migrations/merge_shelves_into_collections.sql (che nella storia principale
-- fonde gli Scaffali dentro le Raccolte): qui portiamo solo la colonna di ordinamento, non la
-- migrazione dati degli Scaffali — questo branch riparte da PR #741, quando gli Scaffali non
-- erano ancora stati introdotti, quindi non c'è nulla da fondere.
--
-- Le Raccolte hanno bisogno di un ordine proprio, scelto dall'utente.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).

ALTER TABLE collections ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;
