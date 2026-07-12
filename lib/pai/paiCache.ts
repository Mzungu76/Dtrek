// Supabase-backed cache wrapper around paiClient.ts's fetchPaiPolygons. Split into its
// own file (rather than living in paiClient.ts) so anything that only needs the raw WFS
// client — e.g. scripts/probe-pai.ts — doesn't transitively pull in lib/supabase.ts,
// whose singleton throws at import time if Supabase env vars aren't set.
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { PAI_DATASET } from '@/lib/geo/datasetConfig'
import { fetchPaiPolygons, PaiUnavailableError, type PaiFeature } from '@/lib/pai/paiClient'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

// Piani di bacino cambiano su scala di anni — non vale ri-interrogare il WFS ad ogni
// calcolo SI. Stesso pattern bbox-keyed lazy-cleanup di poi_cache (app/api/pois/route.ts).
const PAI_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000

export async function fetchPaiPolygonsCached(bbox: string): Promise<PaiFeature[]> {
  if (!PAI_DATASET.baseUrl || !PAI_DATASET.typeName) {
    throw new PaiUnavailableError('PAI dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }
  const bboxKey = normalizeBboxKey(bbox)

  if (shouldRunCleanup('pai_polygon_cache')) {
    supabase.from('pai_polygon_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[pai_polygon_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await supabase
    .from('pai_polygon_cache')
    .select('features')
    .eq('bbox_key', bboxKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (cached) return cached.features as PaiFeature[]

  const features = await fetchPaiPolygons(bbox)

  const expiresAt = new Date(Date.now() + PAI_CACHE_TTL_MS).toISOString()
  supabase.from('pai_polygon_cache')
    .upsert({ bbox_key: bboxKey, features, expires_at: expiresAt }, { onConflict: 'bbox_key' })
    .then(({ error }) => { if (error) console.error('[pai_polygon_cache] upsert error:', error.message) })

  return features
}
