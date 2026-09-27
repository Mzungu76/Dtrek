-- ═══════════════════════════════════════════════════════════
-- Check-in GPS per i Siti (discussione sessione conversazionale, seguito di
-- docs/piano-mete-multitipologia.md §51/§52): l'app non ha mai permesso di dichiarare completato
-- un Sentiero senza una prova reale (traccia GPS registrata/importata) — mai un'autodichiarazione
-- con un solo tocco. Per un Sito (nessun percorso da percorrere, solo un punto) la prova
-- equivalente è un fix GPS reale entro un raggio generoso dalle coordinate del luogo
-- (lib/visitCompletion.ts), non l'assenza di prova.
--
-- `verified` distingue le due strade:
--   true  → traccia GPS reale (ogni Sentiero/Borgo, da sempre) o check-in Sito confermato in zona.
--   false → SOLO il ripiego "registra comunque" di un check-in Sito fuori raggio/senza segnale GPS.
-- Non un gate di scrittura: un'Attività non verificata resta pienamente utilizzabile in privato
-- (Resoconto/Diario) — la distinzione conta solo al momento della pubblicazione/esportazione
-- (Raccolte, export su siti esterni), dove va mostrato un badge "non verificato".
--
-- DEFAULT true: ogni riga già esistente nasce da una traccia reale (mai un'eccezione finora),
-- nessuna Attività storica va marcata come non verificata per omissione.
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- Stesso blocco anche in supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE activities ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
