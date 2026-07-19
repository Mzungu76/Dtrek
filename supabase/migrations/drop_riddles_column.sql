-- Funzionalità "indovinelli per tappa" rimossa (vedi add_riddles_column.sql per la storia della
-- colonna) — l'app non genera più, salva né legge questo campo. La colonna epoche
-- (cached_epoch_pois) resta invariata, è una funzionalità separata ancora attiva.
ALTER TABLE planned_hikes DROP COLUMN IF EXISTS cached_riddles;
