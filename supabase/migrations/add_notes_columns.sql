-- ═══════════════════════════════════════════════════════════
-- Appunti vocali/testuali presi durante un'escursione (trascrizione
-- Web Speech API o testo libero) — vedi app/components/HikeNotesRecorder.tsx.
-- Array di { id, text, timestamp, lat?, lon? } salvato come JSONB sia sulle
-- escursioni pianificate sia su quelle registrate, così la lista resta
-- associata quando una pianificata viene convertita in registrata.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS hike_notes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS hike_notes JSONB DEFAULT '[]'::jsonb;
