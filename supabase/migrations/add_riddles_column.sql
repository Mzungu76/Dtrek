-- Stesso blocco anche in supabase-schema.sql
-- Trail riddles ("indovinelli per tappa") extracted from the generated guide text —
-- see lib/riddles.ts. Each entry carries its own lat/lon (matched against cached_pois/
-- cached_poi_wiki at extraction time), so the navigator can trigger them with the same
-- proximity mechanism as POIs without depending on the guide text at runtime.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_riddles JSONB;
