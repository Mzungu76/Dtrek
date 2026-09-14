-- "Pubblicabile" — un secondo stato distinto da `share_token IS NOT NULL` (già online). Il
-- pulsante "Pubblica" di una Raccolta in elenco (/raccolte) non pubblica più subito: marca solo la
-- Raccolta come pronta, sul posto, senza navigare. La pubblicazione vera avviene in un solo colpo
-- per TUTTE le Raccolte marcate insieme, dalla pagina di pre-pubblicazione (/raccolte/pubblica,
-- "Pubblica tutto") — coerente col fatto che una Raccolta e i suoi Diari vengono sempre pubblicati
-- tutti insieme, non pezzo per pezzo.
--
-- DEFAULT false: nessuna Raccolta esistente risulta marcata finché l'utente non tocca il pulsante
-- — comportamento identico a prima di questa colonna. Non si azzera da sola alla pubblicazione (un
-- clic su "Pubblica tutto" lascia le Raccolte marcate, così l'elenco marcato resta stabile per una
-- prossima revisione/ripubblicazione): l'unico modo di smarcare è ritoccare il pulsante "Pubblica"
-- in elenco.
--
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE collections ADD COLUMN IF NOT EXISTS marked_for_publish BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
