-- ═══════════════════════════════════════════════════════════
-- Check area protetta (Rete Natura 2000) — persistenza per-escursione del solo booleano
-- risultato, stesso pattern dei blocchi DTM/terreno: planned_hikes.cached_in_protected_area/
-- cached_protected_area_track_hash/cached_protected_area_computed_at sono lette/scritte da
-- app/guida/useProtectedAreaCheck.ts (via PATCH /api/planned). Il poligono dei siti Natura 2000
-- è già cacheato lato server per bbox (tabella natura2000_cache, TTL 270gg) — questa colonna
-- evita di rifare comunque, ad ogni apertura, la fetch + la scansione point-in-polygon sulla
-- traccia per arrivare allo stesso risultato booleano, invarianti quanto la traccia stessa
-- (cached_protected_area_track_hash, lib/geoUtils.ts hashTrack, nessun TTL temporale).
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_in_protected_area boolean;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_protected_area_track_hash text;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS cached_protected_area_computed_at timestamptz;
