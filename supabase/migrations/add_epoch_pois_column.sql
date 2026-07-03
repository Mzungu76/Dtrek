-- Stesso blocco anche in supabase-schema.sql
-- Stratigrafia temporale ("cosa vedresti da qui" per epoca) — vedi lib/epochPois.ts.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_epoch_pois JSONB;
