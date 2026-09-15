-- Riga di presentazione libera per il sito personale (/u/[slug]) — vedi lib/publicProfile.ts.
-- Oggi la home del sito mostra solo nome e numeri: chi arriva da un link non ha alcun contesto su
-- chi sia l'autore. `profile_bio` è facoltativa (stringa vuota di default, la sezione sul sito
-- semplicemente non compare finché resta vuota) e distinta da `display_name` (l'identità) per lo
-- stesso motivo per cui `profile_slug`/`profile_enabled` sono due colonne separate: cambiare la
-- presentazione non deve toccare nient'altro.
--
-- Esegui nel Supabase SQL Editor (idempotente, come le altre migrazioni di questo file).

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS profile_bio TEXT NOT NULL DEFAULT '';
