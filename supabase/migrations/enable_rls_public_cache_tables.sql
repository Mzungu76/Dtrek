-- Enable RLS on public reference/cache tables flagged by Supabase's security advisor
-- (rls_disabled_in_public, ERROR level — tables in `public` are exposed to PostgREST, so
-- without RLS the anon key, which ships in client-side JS, can read AND write them directly,
-- bypassing the app entirely). These tables hold no user-owned data — they're read-only
-- caches of public open-data sources (CARG geologia, Natura2000, PTPR POIs, land cover,
-- trail geometry, species images) written only by the service-role client (lib/supabase.ts),
-- which bypasses RLS regardless of policy. A public-read policy with no write policy closes
-- off direct anon/authenticated writes via PostgREST without changing anything the app does.

ALTER TABLE gallery_cascade_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE geologia_cache         ENABLE ROW LEVEL SECURITY;
ALTER TABLE n2000_site_species     ENABLE ROW LEVEL SECURITY;
ALTER TABLE natura2000_cache       ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi_cache              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ptpr_pois              ENABLE ROW LEVEL SECURITY;
ALTER TABLE species_image_fallback ENABLE ROW LEVEL SECURITY;
ALTER TABLE trails                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE uso_suolo_cache        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery_cascade_cache_public_read" ON gallery_cascade_cache;
CREATE POLICY "gallery_cascade_cache_public_read" ON gallery_cascade_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "geologia_cache_public_read" ON geologia_cache;
CREATE POLICY "geologia_cache_public_read" ON geologia_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "n2000_site_species_public_read" ON n2000_site_species;
CREATE POLICY "n2000_site_species_public_read" ON n2000_site_species FOR SELECT USING (true);

DROP POLICY IF EXISTS "natura2000_cache_public_read" ON natura2000_cache;
CREATE POLICY "natura2000_cache_public_read" ON natura2000_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "poi_cache_public_read" ON poi_cache;
CREATE POLICY "poi_cache_public_read" ON poi_cache FOR SELECT USING (true);

DROP POLICY IF EXISTS "ptpr_pois_public_read" ON ptpr_pois;
CREATE POLICY "ptpr_pois_public_read" ON ptpr_pois FOR SELECT USING (true);

DROP POLICY IF EXISTS "species_image_fallback_public_read" ON species_image_fallback;
CREATE POLICY "species_image_fallback_public_read" ON species_image_fallback FOR SELECT USING (true);

DROP POLICY IF EXISTS "trails_public_read" ON trails;
CREATE POLICY "trails_public_read" ON trails FOR SELECT USING (true);

DROP POLICY IF EXISTS "uso_suolo_cache_public_read" ON uso_suolo_cache;
CREATE POLICY "uso_suolo_cache_public_read" ON uso_suolo_cache FOR SELECT USING (true);
