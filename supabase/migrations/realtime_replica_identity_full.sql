-- ═══════════════════════════════════════════════════════════
-- REPLICA IDENTITY FULL sulle tabelle sincronizzate via Realtime — vedi
-- lib/sync/realtimeSync.ts e enable_realtime_sync_tables.sql.
--
-- Con l'identità di default (solo chiave primaria), un evento DELETE porta
-- con sé esclusivamente l'id della riga eliminata: le colonne rimanenti,
-- user_id compreso, risultano NULL nel record "vecchio" che Realtime valuta
-- per la RLS ("*_owner": auth.uid() = user_id). auth.uid() = NULL non è mai
-- vero, quindi la policy nega l'autorizzazione e Supabase scarta l'evento
-- DELETE in silenzio — nessun errore, l'evento semplicemente non arriva a
-- nessun client, nemmeno al proprietario della riga. FULL include tutte le
-- colonne nel record vecchio (anche per UPDATE), rendendo la valutazione
-- RLS corretta per ogni tipo di evento. Esegui nel Supabase SQL Editor
-- (idempotente: ALTER TABLE ... REPLICA IDENTITY non ha una IF NOT EXISTS,
-- ma riapplicare lo stesso valore è un no-op sicuro).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE activities    REPLICA IDENTITY FULL;
ALTER TABLE planned_hikes REPLICA IDENTITY FULL;
ALTER TABLE user_settings REPLICA IDENTITY FULL;
