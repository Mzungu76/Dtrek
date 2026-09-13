-- Impostazioni di pubblicazione a livello di Raccolta — docs/raccolte-pubblicazione-piano.md.
--
-- Finora una Raccolta non aveva NESSUNA impostazione propria: la sua pagina pubblica si limitava
-- ad aggregare i volumi (ciascuno con le proprie `publicSections`, lib/diaryConfig.ts) di ogni
-- Diario membro. Questa colonna aggiunge un `publicSections` a livello di Raccolta che, quando
-- valorizzato, VINCE su quello di ogni Diario membro — letto al momento della pubblicazione
-- (lib/sharePublicCollection.ts, lib/sharePublicDiary.ts), non copiato una tantum nei Diari: un
-- Diario aggiunto alla Raccolta in seguito, o le cui impostazioni proprie cambiano, riceve comunque
-- automaticamente quelle della Raccolta finché ne fa parte.
--
-- NULL (il valore di default, mai scritto finché l'utente non tocca almeno un interruttore a
-- livello di Raccolta) significa "nessuna impostazione qui": ogni Diario membro resta autonomo,
-- comportamento identico a prima di questa colonna.
--
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE collections ADD COLUMN IF NOT EXISTS config JSONB;

NOTIFY pgrst, 'reload schema';
