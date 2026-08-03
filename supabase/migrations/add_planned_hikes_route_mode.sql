-- Stesso blocco anche in supabase-schema.sql
-- Tipologia scelta dall'utente per un percorso a tratta unica (lineare): lo si cammina solo
-- all'andata ('one_way') o si torna sui propri passi ('round_trip')? Prima era solo uno stato
-- React locale in components/guida/GuideReader.tsx — si azzerava ad ogni apertura della guida e
-- non entrava mai nel calcolo dei punteggi. Ora è una proprietà del percorso: distanza, dislivello
-- e durata effettivi raddoppiano quando vale 'round_trip' (vedi lib/routeMode.ts), quindi TEI e
-- Comfort TrailScore vanno ricalcolati ad ogni cambio.
--
-- NULL = non ancora scelta. Per un percorso lineare è lo stato che fa comparire il popup di scelta
-- obbligatoria all'import (prima dell'eventuale generazione dei testi AI, che dipendono dalle
-- cifre); per un anello o un andata-ritorno già tale nella geometria resta NULL per sempre, la
-- domanda non ha senso.
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS route_mode TEXT
  CHECK (route_mode IN ('one_way', 'round_trip'));

NOTIFY pgrst, 'reload schema';
