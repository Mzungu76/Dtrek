-- Cache Supabase per gli arricchimenti geografici via Overpass delle guide — punto di partenza
-- (lib/routeBuilder/startPointInfo.ts), servizi di ritorno bus/treno/taxi
-- (lib/routeBuilder/returnOptions.ts) e copertura Street View plausibile
-- (lib/routeBuilder/streetViewCoverage.ts). Stesso pattern di poi_cache/walk_network_cache: dato
-- condiviso (non per-utente, niente user_id), scritto solo dal client service-role
-- (lib/supabase.ts) dalle rotte app/api/route-build/*. Prima di questa cache ogni visione di una
-- guida rifaceva le stesse chiamate Overpass — con più utenti sulla stessa guida il carico
-- scalava con le visualizzazioni di pagina invece che con i contenuti creati; con questa cache
-- solo la prima visione di ciascun punto/guida tocca Overpass, tutte le successive (qualsiasi
-- utente, qualsiasi dispositivo) leggono da qui. Si affianca alla cache locale IndexedDB
-- (lib/routeBuilder/geoInfoCache.ts, usata come L1 più veloce del round-trip di rete) invece di
-- sostituirla. TTL 30gg come la cache locale: parcheggi/fermate/strade non cambiano da un giorno
-- all'altro, non serve un rifresco frequente.
-- Esegui nel Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS start_point_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  point_key     text NOT NULL UNIQUE,
  info          jsonb,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_start_point_cache_expires_at ON start_point_cache (expires_at);

ALTER TABLE start_point_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "start_point_cache_public_read" ON start_point_cache;
CREATE POLICY "start_point_cache_public_read" ON start_point_cache FOR SELECT USING (true);


CREATE TABLE IF NOT EXISTS return_options_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  point_key     text NOT NULL UNIQUE,
  options       jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_return_options_cache_expires_at ON return_options_cache (expires_at);

ALTER TABLE return_options_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "return_options_cache_public_read" ON return_options_cache;
CREATE POLICY "return_options_cache_public_read" ON return_options_cache FOR SELECT USING (true);


CREATE TABLE IF NOT EXISTS street_view_coverage_cache (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  points_key    text NOT NULL UNIQUE,
  covered       jsonb NOT NULL,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_street_view_coverage_cache_expires_at ON street_view_coverage_cache (expires_at);

ALTER TABLE street_view_coverage_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "street_view_coverage_cache_public_read" ON street_view_coverage_cache;
CREATE POLICY "street_view_coverage_cache_public_read" ON street_view_coverage_cache FOR SELECT USING (true);
