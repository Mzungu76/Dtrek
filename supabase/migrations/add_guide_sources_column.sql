-- Stesso blocco anche in supabase-schema.sql
-- Fonti web citate da Giulia durante la generazione della guida (tag [fonti] nel prompt di
-- app/api/guide/route.ts, estratto in lib/guideSources.ts) — NULL/vuoto se la ricerca web non ha
-- prodotto citazioni o su guide generate prima di questa colonna.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_sources JSONB;
