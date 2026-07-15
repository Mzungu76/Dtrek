-- ═══════════════════════════════════════════════════════════
-- Timestamp di aggiornamento per la verifica di freschezza cache locale
-- (IndexedDB) vs Supabase — vedi lib/sync/pullEngine.ts. Senza questa
-- colonna, un dispositivo che ha già una copia locale di un'escursione/
-- percorso non aveva modo di sapere che un altro dispositivo l'ha modificata
-- nel frattempo, e restava bloccato sulla versione vecchia finché non
-- cancellava la cache locale.
--
-- activities/planned_hikes/activity_photos non avevano affatto updated_at;
-- user_settings/hike_reports/hike_questionnaires ce l'avevano già ma solo
-- quando il codice applicativo lo impostava esplicitamente in ogni upsert/
-- update — il trigger sotto lo rende automatico e impossibile da dimenticare
-- per tutte e sei le tabelle sincronizzate localmente.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE activities      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE planned_hikes   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_activities_updated_at    ON activities (updated_at);
CREATE INDEX IF NOT EXISTS idx_planned_hikes_updated_at ON planned_hikes (updated_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activities_updated_at ON activities;
CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_planned_hikes_updated_at ON planned_hikes;
CREATE TRIGGER trg_planned_hikes_updated_at
  BEFORE UPDATE ON planned_hikes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_activity_photos_updated_at ON activity_photos;
CREATE TRIGGER trg_activity_photos_updated_at
  BEFORE UPDATE ON activity_photos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hike_reports_updated_at ON hike_reports;
CREATE TRIGGER trg_hike_reports_updated_at
  BEFORE UPDATE ON hike_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hike_questionnaires_updated_at ON hike_questionnaires;
CREATE TRIGGER trg_hike_questionnaires_updated_at
  BEFORE UPDATE ON hike_questionnaires
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
