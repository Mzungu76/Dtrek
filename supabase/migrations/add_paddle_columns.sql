-- Pagamenti Paddle (docs/navigator-dtrek-boundary.md) — estende subscription_tier ('free'/'premium',
-- già esistente) con i dati necessari a gestire davvero un abbonamento/acquisto Paddle.
--
-- premium_expires_at: NULL + subscription_tier='premium' ⇒ sblocco a vita (una tantum), nessuna
-- scadenza. Valorizzato ⇒ abbonamento ricorrente attivo fino a quella data, aggiornata ad ogni
-- rinnovo dal webhook (app/api/webhooks/paddle/route.ts) — se il rinnovo/pagamento fallisce o
-- l'utente cancella, questa data smette semplicemente di avanzare e l'accesso scade da solo,
-- nessun downgrade esplicito necessario (vedi lib/dtrekEntitlement.ts).
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS premium_expires_at     TIMESTAMPTZ;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS paddle_customer_id     TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT;
