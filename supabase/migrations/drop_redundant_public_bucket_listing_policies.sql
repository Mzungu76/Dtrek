-- ═══════════════════════════════════════════════════════════
-- Security advisor WARN: public_bucket_allows_listing (dtrek-photos, dtrek-reports)
-- ═══════════════════════════════════════════════════════════
--
-- Both buckets are `public = true`, so object URLs already work without any policy on
-- storage.objects. These two SELECT policies were live (created outside this repo — they've
-- always been commented out here, see the -- CREATE POLICY blocks near hike_reports/
-- activity_photos above) and only added the ability to enumerate/list every file in the
-- bucket via the Storage API with the anon key. No code in this repo ever calls
-- supabase.storage.from(...).list() on either bucket (checked: only .upload/.getPublicUrl/
-- .remove are used), so removing them doesn't change app behavior — public object URLs are
-- unaffected per Supabase's own remediation for this lint.
-- Esegui nel Supabase SQL Editor (idempotente).

DROP POLICY IF EXISTS "public_read_photos" ON storage.objects;
DROP POLICY IF EXISTS "public_read_reports" ON storage.objects;
