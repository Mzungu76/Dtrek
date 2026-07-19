-- ═══════════════════════════════════════════════════════════
-- Abilita Supabase Realtime (postgres_changes) sulle tabelle sincronizzate
-- localmente — vedi lib/sync/realtimeSync.ts. Senza questa pubblicazione,
-- nessun evento arriva mai al client e lib/sync/pullEngine.ts resta sul solo
-- polling esistente (apertura app, riconnessione, tab tornata visibile,
-- safety net ogni 5 minuti) — un dispositivo lasciato aperto in primo piano
-- può restare fino a 5 minuti indietro rispetto a una modifica fatta altrove.
--
-- Le policy RLS "*_owner" (auth.uid() = user_id, vedi sopra in questo file)
-- restano l'unico confine di sicurezza: Realtime consegna solo le righe che
-- l'utente autenticato potrebbe leggere comunque via RLS. Esegui nel
-- Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE activities;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'planned_hikes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE planned_hikes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
  END IF;
END $$;
