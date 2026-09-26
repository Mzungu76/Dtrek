-- ═══════════════════════════════════════════════════════════
-- Piano mete multi-tipologia (docs/piano-mete-multitipologia.md §51.2). Provenienza della
-- Guida di un Sito: NULL = Guida autonoma, altrimenti l'id della Guida Borgo/Città da cui è
-- nata (una tappa promossa a Guida a sé, §51.3) — la Guida figlia resta di proprietà di
-- quella Guida (§51.4: mai nella lista top-level "Siti", solo annidata nella Guida madre).
--
-- Self-FK su planned_hikes stessa — un concetto diverso da place_id (supabase/migrations/
-- add_planned_hikes_place_link.sql: "a quale luogo del catalogo corrisponde"), questo è "da
-- quale Guida è nata". ON DELETE SET NULL: se la Guida madre viene cancellata, quella del Sito
-- sopravvive e torna semplicemente autonoma, mai cancellata a cascata.
--
-- Valorizzato solo quando meta_type = 'sito' — assente per sentiero/borgo_citta, la domanda
-- non si pone (nessuna Guida di quelle due tipologie nasce "dentro" un'altra Guida). Mai
-- dedotto da vicinanza geografica o altra euristica (piano §48.11): scelto dall'azione esplicita
-- di promozione dell'utente (§51.3).
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

-- planned_hikes.id è TEXT (non UUID come dtrek_places.id) — vedi CREATE TABLE in supabase-schema.sql.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS parent_meta_id TEXT REFERENCES planned_hikes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_planned_hikes_parent_meta_id ON planned_hikes (parent_meta_id);

NOTIFY pgrst, 'reload schema';
