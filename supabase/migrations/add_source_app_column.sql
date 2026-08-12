-- ═══════════════════════════════════════════════════════════
-- DTrek Navigator ha un tetto di "1 percorso alla volta" per ciò che viene creato AL SUO
-- INTERNO (import file/URL, registrazione senza pianificazione) — vedi lib/navigatorSlot.ts.
-- Un percorso pianificato nell'app principale resta invece sempre visibile/navigabile in
-- Navigator senza alcun limite: questa colonna distingue le due origini, così il controllo
-- del tetto non deve indovinare da dove sia arrivata una riga.
-- NULL = creato dall'app principale (comportamento di sempre, nessuna riga esistente cambia
-- stato). 'navigator' = creato tramite un'azione di importazione/registrazione di Navigator.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS source_app TEXT;
ALTER TABLE activities    ADD COLUMN IF NOT EXISTS source_app TEXT;
