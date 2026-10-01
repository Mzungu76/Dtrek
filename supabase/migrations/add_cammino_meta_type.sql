-- ═══════════════════════════════════════════════════════════
-- Piano Cammini (docs/piano-cammini.md, Fase 1). Quarta tipologia di Meta: 'cammino', un
-- itinerario a piedi di più giorni composto da tappe reali in sequenza. Estende i tre vincoli
-- CHECK su meta_type (nomi generati da Postgres per i CHECK di colonna inline).
-- Nessuna riga esistente cambia: il DEFAULT resta 'sentiero'.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes DROP CONSTRAINT IF EXISTS planned_hikes_meta_type_check;
ALTER TABLE planned_hikes ADD CONSTRAINT planned_hikes_meta_type_check
  CHECK (meta_type IN ('sentiero', 'borgo_citta', 'sito', 'cammino'));

ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_meta_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_meta_type_check
  CHECK (meta_type IN ('sentiero', 'borgo_citta', 'sito', 'cammino'));

ALTER TABLE dtrek_places DROP CONSTRAINT IF EXISTS dtrek_places_meta_type_check;
ALTER TABLE dtrek_places ADD CONSTRAINT dtrek_places_meta_type_check
  CHECK (meta_type IN ('sentiero', 'borgo_citta', 'sito', 'cammino'));

-- Piano delle tappe di un Cammino (Guida con tappe interne): tappe incluse, raggruppamento per
-- giornata, direzione, date, pernottamenti. NULL per ogni altra tipologia.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cammino_plan JSONB;

-- Tappa di un Cammino a cui appartiene un'Attività (indice 0-based nel piano). NULL altrove.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tappa_index INTEGER;

NOTIFY pgrst, 'reload schema';
