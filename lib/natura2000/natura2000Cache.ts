// Supabase-backed cache wrapper around natura2000Client.ts's fetchNatura2000Polygons. Split
// from the client for the same reason as lib/pai/paiCache.ts: scripts/probe-natura2000.ts must
// be able to run without lib/supabase.ts's singleton (which throws at import time if env vars
// are missing).
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { NATURA2000_DATASET } from '@/lib/geo/datasetConfig'
import { fetchNatura2000Polygons, Natura2000UnavailableError, type Natura2000Feature } from '@/lib/natura2000/natura2000Client'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

// Designations change on a scale of years, not days — same reasoning as PAI's 90-day TTL but
// longer, since Natura2000 site boundaries are even more stable than hydrogeological risk plans.
const NATURA2000_CACHE_TTL_MS = 270 * 24 * 60 * 60 * 1000

export async function fetchNatura2000PolygonsCached(bbox: string): Promise<Natura2000Feature[]> {
  if (!NATURA2000_DATASET.baseUrl || !NATURA2000_DATASET.typeName) {
    throw new Natura2000UnavailableError('Natura2000 dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }
  const bboxKey = normalizeBboxKey(bbox)

  if (shouldRunCleanup('natura2000_cache')) {
    supabase.from('natura2000_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[natura2000_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await supabase
    .from('natura2000_cache')
    .select('features')
    .eq('bbox_key', bboxKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (cached) return cached.features as Natura2000Feature[]

  const features = await fetchNatura2000Polygons(bbox)

  const expiresAt = new Date(Date.now() + NATURA2000_CACHE_TTL_MS).toISOString()
  supabase.from('natura2000_cache')
    .upsert({ bbox_key: bboxKey, features, expires_at: expiresAt }, { onConflict: 'bbox_key' })
    .then(({ error }) => { if (error) console.error('[natura2000_cache] upsert error:', error.message) })

  return features
}
