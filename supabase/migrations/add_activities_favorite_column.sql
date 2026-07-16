-- Stesso blocco anche in supabase-schema.sql
-- Preferito nella galleria Resoconto — stesso concetto già esistente per planned_hikes
-- (vedi add_riddles_column.sql/supabase-schema.sql, colonna "favorite"), ora replicato anche
-- per le escursioni concluse così il filtro "Preferiti" e la stella sulla copertina funzionano
-- su entrambe le sezioni (vedi app/resoconto/ResocontoHub.tsx).
ALTER TABLE activities ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;
