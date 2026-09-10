-- ═══════════════════════════════════════════════════════════
-- Piano mete multi-tipologia (docs/piano-mete-multitipologia.md, Blocco D —
-- Experience §25/§26). Un Percorso 'borgo_citta' o 'sito' non ha una traccia GPX da cui
-- derivare una posizione (a differenza di un sentiero, che la ricava da trackPoints) — serve
-- un punto esplicito per mostrarlo in mappa e per collegarlo alla sua riga in dtrek_places
-- (da cui lib/metaSearch/placeRelations.ts legge le tappe di un itinerario, piano §25).
--
-- place_id è nullable e SET NULL on delete: una Meta salvata dall'utente sopravvive anche se
-- la riga di catalogo viene rimossa/rifusa da una successiva importazione (piano §48.7, "ogni
-- nuova fonte ha source/source_id" — dtrek_places può cambiare sotto, planned_hikes no).
-- latitude/longitude restano popolate anche se place_id si azzera, così la Meta resta
-- localizzabile comunque.
--
-- Un sentiero non usa mai queste colonne (la sua posizione resta trackPoints/routePolyline) —
-- nessun call site esistente le legge, quindi restano NULL per ogni riga 'sentiero'.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES dtrek_places(id) ON DELETE SET NULL;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_planned_hikes_place_id ON planned_hikes (place_id);

NOTIFY pgrst, 'reload schema';
