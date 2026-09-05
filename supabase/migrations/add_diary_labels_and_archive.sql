-- Restyling pagina /diari (docs/diari-restyling-piano.md, Fase 0) — il modo di far scalare
-- l'elenco dei Diari senza cartelle: etichette libere + archiviazione, non una gerarchia in più.
--
-- `labels` è testo libero scelto dall'utente (Natura, Urbano, una zona...), non un enum: un
-- Diario può avere zero, una o più etichette, e stare quindi in più "insiemi" contemporaneamente
-- senza dover scegliere una sola cartella di appartenenza (vedi il confronto con le raccolte come
-- cartelle in docs/mockup-diari-redesign/README.md).
--
-- `archived_at` è proposta dall'utente (un Diario senza uscite da mesi), mai impostata da sola:
-- nessun job che la valorizza in automatico — un'archiviazione silenziosa che fa sparire roba
-- dalla pagina di atterraggio sarebbe peggio del problema che risolve.
--
-- Nessun backfill: i Diari esistenti restano con labels = '{}' e archived_at = NULL, cioè "tutti
-- attivi e senza etichette" — la pagina si comporta come oggi finché l'utente non usa le funzioni
-- nuove.
--
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE diaries ADD COLUMN IF NOT EXISTS labels      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE diaries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_diaries_user_archived ON diaries (user_id, archived_at);
