-- Stesso blocco anche in supabase-schema.sql
-- Sentinella civica: segnalazioni utente foto+GPS. Flusso di segnalazione, non rilevamento
-- automatico. Riusa il bucket Storage 'dtrek-photos' e le sue policy già esistenti (path
-- ${userId}/civic-reports/${reportId}.jpg — primo segmento resta lo userId).
CREATE TABLE IF NOT EXISTS civic_reports (
  id              TEXT PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  planned_hike_id TEXT,
  url             TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civic_reports_user_id ON civic_reports (user_id);

ALTER TABLE civic_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "civic_reports_owner" ON civic_reports;
CREATE POLICY "civic_reports_owner"
  ON civic_reports FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
