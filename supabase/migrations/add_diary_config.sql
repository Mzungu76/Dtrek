-- ═══════════════════════════════════════════════════════════
-- Configurazione del Diario spostata da localStorage a Supabase, così segue l'account e non un
-- singolo dispositivo — vedi lib/diaryConfig.ts e app/api/diary-config/route.ts.
--
-- Una riga sola per utente, come il resto di user_settings. Contiene: title, subtitle, author,
-- coverUrl (ora un URL di Supabase Storage, non più un data URL in localStorage — vedi
-- lib/diaryCoverUpload.ts), statsToggles, reportExtrasDefault, reportExtrasByActivity (override
-- per singola escursione), excludedActivityIds (esclusione dal diario), showStubs.
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS diary_config JSONB;

NOTIFY pgrst, 'reload schema';
