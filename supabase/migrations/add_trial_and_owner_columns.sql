-- Gate/trial Dtrek (docs/navigator-dtrek-boundary.md) — due colonne nuove su user_settings:
--
-- is_owner: bypass totale di paywall e limiti di trial, ovunque nel codice (lib/dtrekEntitlement.ts).
-- Protetto dalla RLS già esistente sulla tabella (policy user_settings_owner, supabase-schema.sql)
-- — ogni utente legge solo la propria riga, quindi non è mai visibile ad altri account. Non
-- impostabile via API (POST /api/user-settings non lo accetta nel body): va attivato a mano su
-- Supabase con un UPDATE una tantum sulla riga dell'unico account owner.
--
-- trial_started_at: inizio del periodo di prova (30 giorni, vedi lib/dtrekEntitlement.ts) — DEFAULT
-- NOW() così ogni nuova riga user_settings (creata al primo salvataggio impostazioni di un nuovo
-- utente) parte automaticamente da lì, nessun codice applicativo deve impostarla esplicitamente.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS is_owner          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS trial_started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
