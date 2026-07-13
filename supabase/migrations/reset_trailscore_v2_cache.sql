-- ═══════════════════════════════════════════════════════════
-- Trail Score v2 — reset una tantum di cached_ts_total.
-- Trail Score è passato da una somma di 4 segmenti a 0-400 a un punteggio MCDA a 0-100
-- (vedi lib/trailScoreV2.ts, components/ScoreRing.tsx's TRAIL_SCORE_MAX). I valori esistenti
-- in cached_ts_total sono stati calcolati sotto la vecchia scala e non esiste una colonna di
-- versione per distinguerli — un reset totale è l'unica opzione sicura.
-- Nessuna modifica di codice necessaria oltre a questa migrazione: previewScoreValue()
-- (app/guida/GuidaHub.tsx) tratta già cached_ts_total NULL come "non ancora calcolato" e
-- ricade su cached_trail_score; l'effetto di ricalcolo live nella vista di dettaglio
-- ripopola la cache alla prossima apertura. Dopo questa migrazione, lanciare una volta
-- scripts/recalc-trailscore-v2.ts per ri-scaldare la cache invece di aspettare le riaperture
-- organiche.
-- Esegui nel Supabase SQL Editor (idempotente, il WHERE la rende no-op se già a NULL).
-- ═══════════════════════════════════════════════════════════

UPDATE planned_hikes SET cached_ts_total = NULL WHERE cached_ts_total IS NOT NULL;
