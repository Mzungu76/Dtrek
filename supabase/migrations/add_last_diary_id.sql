-- Fase 11 di docs/diario-a-libro-piano.md: l'utente ha chiesto che l'apertura dell'app porti
-- direttamente al Sommario dell'ultimo Diario visualizzato, invece che allo scaffale "I miei
-- Diari" (comunque sempre raggiungibile tramite il drawer laterale). Serve ricordare QUALE
-- Diario era aperto — su user_settings, come diarioLibroEnabled, così segue l'utente su ogni
-- dispositivo invece di restare legato al solo browser (localStorage).
--
-- ON DELETE SET NULL: se il Diario ricordato viene eliminato, l'app ricade sul Diario di default
-- invece di rompersi — nessun vincolo che impedirebbe l'eliminazione.
--
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS last_diary_id UUID REFERENCES diaries(id) ON DELETE SET NULL;
