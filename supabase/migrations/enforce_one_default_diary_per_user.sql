-- Guardia contro un bug di dati scoperto in produzione: il backfill del Diario di default
-- (backfill_diaries_from_existing_data.sql) era stato eseguito più volte per lo stesso utente,
-- creando più righe con is_default = true. Ogni punto del codice che sceglie "il" Diario di
-- default (getDefaultDiaryId/listSelectableDiaries in lib/diari/syntheticPercorso.ts, la
-- copertina in evidenza di /diario, /diario/libro/[id]…) fa `diaries.find(d => d.isDefault)`,
-- che con più righe candidate ne sceglie una arbitraria a seconda dell'ordine — i nuovi Resoconti
-- potevano finire silenziosamente in una copia duplicata invece che nel Diario che l'utente vede
-- davvero, dando l'impressione che i Resoconti non fossero "abbonati" correttamente ai Diari.
--
-- Un indice univoco parziale impedisce che si ripeta: un secondo INSERT/UPDATE con is_default =
-- true per lo stesso user_id fallisce subito con un errore di vincolo, invece di corrompere
-- silenziosamente i dati. Le righe duplicate già esistenti per l'utente che ha segnalato il
-- problema sono state consolidate manualmente (Supabase SQL Editor) prima di applicare questo
-- indice.
--
-- Esegui nel Supabase SQL Editor (idempotente — IF NOT EXISTS).

CREATE UNIQUE INDEX IF NOT EXISTS diaries_one_default_per_user
ON diaries (user_id)
WHERE is_default = true;
