// Supabase-backed cache wrapper around natura2000Client.ts's fetchNatura2000Polygons. Split
// from the client so scripts/probe-natura2000.ts can run without lib/supabase.ts's singleton
// (which throws at import time if env vars are missing).
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { NATURA2000_DATASET } from '@/lib/geo/datasetConfig'
import { fetchNatura2000Polygons, Natura2000UnavailableError, type Natura2000Feature } from '@/lib/natura2000/natura2000Client'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

// Designations change on a scale of years, not days — a long TTL, since Natura2000 site
// boundaries are very stable.
const NATURA2000_CACHE_TTL_MS = 270 * 24 * 60 * 60 * 1000

// Same reasoning as geologiaCache.ts's CACHE_LOOKUP_TIMEOUT_MS — a stalled Supabase
// connection shouldn't be able to hold the request past a normal cache-miss cost.
const CACHE_LOOKUP_TIMEOUT_MS = 5000

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function fetchNatura2000PolygonsCached(bbox: string): Promise<Natura2000Feature[]> {
  if (!NATURA2000_DATASET.baseUrl || !NATURA2000_DATASET.typeName) {
    throw new Natura2000UnavailableError('Natura2000 dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }
  const bboxKey = normalizeBboxKey(bbox)

  if (shouldRunCleanup('natura2000_cache')) {
    supabase.from('natura2000_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[natura2000_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await withTimeout(
    supabase
      .from('natura2000_cache')
      .select('features')
      .eq('bbox_key', bboxKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    CACHE_LOOKUP_TIMEOUT_MS,
  ).catch(() => ({ data: null }))
  if (cached) return cached.features as Natura2000Feature[]

  const features = await fetchNatura2000Polygons(bbox)

  const expiresAt = new Date(Date.now() + NATURA2000_CACHE_TTL_MS).toISOString()
  supabase.from('natura2000_cache')
    .upsert({ bbox_key: bboxKey, features, expires_at: expiresAt }, { onConflict: 'bbox_key' })
    .then(({ error }) => { if (error) console.error('[natura2000_cache] upsert error:', error.message) })

  return features
}
