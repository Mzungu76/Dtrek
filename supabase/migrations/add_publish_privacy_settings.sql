-- Privacy della pubblicazione — docs/raccolte-pubblicazione-piano.md, Fase 3f. Due interruttori
-- globali per l'utente (non per Diario o Raccolta: la scelta è "quanto mi fido di condividere",
-- non varia documento per documento), applicati nel core condiviso da Diario e Raccolta
-- (lib/sharePublicDiary.ts) — proteggono ogni livello di pubblicazione senza tre implementazioni.
--
-- `publish_hide_home_starts` DEFAULT true: un archivio pubblico di tracce con partenza sempre
-- nello stesso punto è una mappa di dove abita l'autore — il rischio specifico di un'app che
-- registra uscite reali, non una preoccupazione teorica. Default attivo, e RETROATTIVO: si applica
-- anche ai link già pubblicati (letto live a ogni apertura della pagina pubblica, non congelato al
-- momento della pubblicazione) — decisione esplicita, non un effetto collaterale.
--
-- `publish_hide_exact_dates` DEFAULT false: mostrare "agosto 2026" invece di "29 agosto 2026". Meno
-- urgente della precedente (la data di per sé non localizza nulla), quindi di default resta come è
-- oggi — l'utente può attivarla se non vuole che le proprie abitudini (giorni della settimana
-- ricorrenti) siano leggibili da un elenco pubblico di uscite.
--
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS publish_hide_home_starts BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS publish_hide_exact_dates BOOLEAN NOT NULL DEFAULT false;
