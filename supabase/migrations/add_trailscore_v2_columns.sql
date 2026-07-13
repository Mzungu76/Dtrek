-- ═══════════════════════════════════════════════════════════
-- Trail Score v2 — colonne di trasparenza per la correzione di densità dati
-- applicata all'Affidabilità (CL/SI), vedi lib/cl/signals/densitySignal.ts e
-- lib/cl/computeCL.ts. si_score resta il valore GIÀ corretto (nessuna
-- migrazione di significato per quella colonna); si_score_raw/si_density_factor
-- sono nuovi, solo per trasparenza/debug — non servono a nessuna logica di
-- ricalcolo (le scadenze TTL restano guidate dalle colonne si_*_computed_at
-- esistenti).
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE trails        ADD COLUMN IF NOT EXISTS si_score_raw float;
ALTER TABLE trails        ADD COLUMN IF NOT EXISTS si_density_factor float;

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_score_raw float;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS si_density_factor float;
