-- Profilo pubblico unico per utente — docs/raccolte-pubblicazione-piano.md, Fase 3 di un piano di
-- pubblicazione più ampio (Reportage/Diario/Raccolta pubblicabili singolarmente da tempo; questa è
-- la vetrina che li raccoglie sotto un solo link). Decisione esplicita dell'utente: uno slug
-- leggibile (`/u/marco-rossi`) come ALIAS pubblico, mai come credenziale — l'id utente reale
-- (`user_settings.user_id`) resta l'unica chiave interna, immutabile e opaco. Cambiare il nome
-- visualizzato (`display_name`) non deve mai costringere a cambiare lo slug.
--
-- Due colonne distinte, non una sola: `profile_slug` è l'IDENTITÀ (stabile, scelta una volta),
-- `profile_enabled` è la VISIBILITÀ (revocabile in un tap, senza perdere lo slug scelto) — un
-- utente deve poter nascondere il proprio profilo pubblico temporaneamente senza doverne
-- rinegoziare l'indirizzo se lo riattiva.
--
-- Unicità case-insensitive: "Marco-Rossi" e "marco-rossi" sono lo stesso indirizzo — un secondo
-- utente non deve poter "occupare" uno slug già preso solo cambiando maiuscole. Lo slug è sempre
-- scritto già normalizzato in minuscolo dall'applicazione (lib/profileSlug.ts); l'indice
-- case-insensitive è una garanzia lato database, non solo lato client.
--
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS profile_slug TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS profile_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_profile_slug_ci
  ON user_settings (lower(profile_slug)) WHERE profile_slug IS NOT NULL;

-- Lettura pubblica per il profilo — stessa policy "cintura e bretelle" già su `diaries`/
-- `collections` (la vera guardia è la lettura lato server col client service-role, che scavalca la
-- RLS comunque; questa policy copre un eventuale accesso diretto via client anon/authenticated).
DROP POLICY IF EXISTS "user_settings_public_profile" ON user_settings;
CREATE POLICY "user_settings_public_profile"
  ON user_settings FOR SELECT
  USING (profile_enabled = true AND profile_slug IS NOT NULL);
