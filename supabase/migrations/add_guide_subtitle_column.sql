-- Stesso blocco anche in supabase-schema.sql
-- Sottotitolo da copertina scritto dall'AI al momento della generazione della guida (tag
-- [sottotitolo] nel prompt di app/api/guide/route.ts, estratto in lib/coverSubtitle.ts) — NULL
-- sulle guide generate prima di questa colonna o non ancora rigenerate.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_guide_subtitle TEXT;
