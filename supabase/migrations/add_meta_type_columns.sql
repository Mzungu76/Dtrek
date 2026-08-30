-- ═══════════════════════════════════════════════════════════
-- Piano mete multi-tipologia (docs/piano-mete-multitipologia.md §16, Blocco A —
-- Foundation). Introduce la distinzione di tipologia della Meta senza toccare
-- alcun comportamento esistente: ogni riga già presente diventa 'sentiero' via
-- DEFAULT, così tutto il codice che oggi assume Meta = escursione continua a
-- funzionare invariato finché i call site non vengono resi condizionali (vedi
-- docs/meta-multitype-audit.md §1 per l'elenco dei punti da gestire prima di
-- aprire nuovi percorsi di creazione Borgo/Città o Sito).
--
-- site_type è valorizzato solo quando meta_type = 'sito' (vedi lib/metaTypes.ts
-- per l'elenco delle sottotipologie) — NULL per sentieri e borghi/città, la
-- domanda non si pone.
--
-- Deliberatamente NON dedotto da alcuna euristica (presenza di GPX, geometria,
-- ecc. — vedi piano §48.11): il valore è scelto esplicitamente dall'utente al
-- momento della ricerca/creazione della Meta, mai inferito lato server.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS meta_type TEXT NOT NULL DEFAULT 'sentiero'
  CHECK (meta_type IN ('sentiero', 'borgo_citta', 'sito'));

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS site_type TEXT
  CHECK (site_type IS NULL OR site_type IN (
    'museo', 'castello', 'abbazia', 'chiesa', 'sito_archeologico', 'monumento',
    'palazzo', 'teatro', 'cascata', 'grotta', 'belvedere', 'area_naturale', 'altro'
  ));

CREATE INDEX IF NOT EXISTS idx_planned_hikes_meta_type ON planned_hikes (meta_type);
CREATE INDEX IF NOT EXISTS idx_planned_hikes_site_type ON planned_hikes (site_type);

NOTIFY pgrst, 'reload schema';
