-- ═══════════════════════════════════════════════════════════
-- Galleria Verde / Galleria Selvatica — cache per cella geografica, non per percorso
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

-- ── Cache cascata galleria, per CELLA di griglia fissa (non per bbox dell'intero
-- percorso come gallery_cascade_cache, che resta in piedi ma non viene più scritta
-- da qui in poi) ────────────────────────────────────────────────────────────────
-- Stesso identico contenuto per riga (items = risultato della cascata GBIF→
-- iNaturalist→buffer esteso→Natura2000, già arricchito con le immagini Wikidata di
-- riserva), ma la chiave è una cella di ~5,5 km di lato (vedi CELL_SIZE_DEG in
-- lib/natureGrid.ts), non il rettangolo dell'intero percorso arrotondato.
-- Due percorsi diversi che toccano la stessa cella condividono la riga, anche se
-- hanno forma o lunghezza completamente diverse — cosa che con la vecchia cache
-- (chiave = bbox dell'intero percorso) succedeva solo per percorsi quasi identici.
-- TTL lungo (270gg, come natura2000_cache — non 7): la presenza di una specie in una zona
-- non cambia di settimana in settimana; la stagionalità resta comunque coperta dal mese in chiave.
CREATE TABLE IF NOT EXISTS nature_cell_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cell_key      text NOT NULL,        -- "<latCell>_<lonCell>", vedi cellsForBounds() in lib/natureGrid.ts
  gallery_type  text NOT NULL,        -- 'flora' | 'fauna'
  month         smallint NOT NULL,
  fallback_level smallint NOT NULL,   -- 1 = cella diretta, 2 = buffer esteso, 3 = fallback Natura2000
  items         jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  UNIQUE (cell_key, gallery_type, month)
);

CREATE INDEX IF NOT EXISTS idx_nature_cell_cache_expires_at ON nature_cell_cache (expires_at);
