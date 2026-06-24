// Supabase-backed cache wrapper around geologiaClient.ts's fetchGeologiaAtPoint. Split into
// its own file for the same reason as paiCache.ts: keeps lib/supabase.ts's import-time
// env-var check out of geologiaClient.ts, so scripts/probe-geologia.ts can run without
// Supabase configured.
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { GEOLOGIA_DATASET } from '@/lib/geo/datasetConfig'
import { fetchGeologiaAtPoint, GeologiaUnavailableError, type GeologiaFeature } from '@/lib/geologia/geologiaClient'

// Litologia non cambia nel tempo a parità di punto — TTL lungo, quasi permanente.
const GEOLOGIA_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000

export async function fetchGeologiaAtPointCached(lat: number, lon: number): Promise<GeologiaFeature | null> {
  if (!GEOLOGIA_DATASET.baseUrl || !GEOLOGIA_DATASET.layerName) {
    throw new GeologiaUnavailableError('Geologia dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }
  // Reuses bbox-key rounding (2 decimals, ~1km grid) as a point key — CARG lithology
  // doesn't vary at sub-km scale, so this granularity is a deliberate choice, not just reuse
  // for its own sake.
  const pointKey = normalizeBboxKey(`${lat},${lon}`)

  supabase.from('geologia_cache').delete().lt('expires_at', new Date().toISOString())
    .then(({ error }) => { if (error) console.warn('[geologia_cache] cleanup error:', error.message) })

  const { data: cached } = await supabase
    .from('geologia_cache')
    .select('feature')
    .eq('point_key', pointKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (cached) return cached.feature as GeologiaFeature | null

  const feature = await fetchGeologiaAtPoint(lat, lon)

  const expiresAt = new Date(Date.now() + GEOLOGIA_CACHE_TTL_MS).toISOString()
  supabase.from('geologia_cache')
    .upsert({ point_key: pointKey, feature, expires_at: expiresAt }, { onConflict: 'point_key' })
    .then(({ error }) => { if (error) console.error('[geologia_cache] upsert error:', error.message) })

  return feature
}
