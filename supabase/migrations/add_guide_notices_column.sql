-- Stesso blocco anche in supabase-schema.sql
-- Avvisi sullo stato aggiornato del percorso (chiusure, deviazioni, lavori) trovati dalla ricerca
-- web di Giulia al momento della generazione della guida (tag [avviso] nel prompt di
-- app/api/guide/route.ts, estratto in lib/guideNotices.ts) — NULL/vuoto se nessuna criticità nota
-- o su guide generate prima di questa colonna.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_notices JSONB;
