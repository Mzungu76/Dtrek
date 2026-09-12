-- ═══════════════════════════════════════════════════════════
-- Configurazione della Bacheca-dashboard (Direzione C, docs/mockup-bacheca-dashboard/README.md) —
-- schede personalizzabili dall'utente, ciascuna col proprio elenco di widget. Stessa forma di
-- add_diary_config.sql: una riga sola per utente, dentro user_settings.
--
-- Vedi lib/dashboardConfig.ts e app/api/dashboard-config/route.ts.
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS dashboard_config JSONB;

NOTIFY pgrst, 'reload schema';
