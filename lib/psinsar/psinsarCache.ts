// Supabase-backed cache wrapper around psinsarClient.ts's fetchPsinsarPoints — stesso
// motivo della separazione lib/pai/paiClient.ts / lib/pai/paiCache.ts: tenere il client
// WFS puro libero da lib/supabase.ts, che lancia all'import se le env var non sono
// settate (es. scripts/probe-psinsar.ts).
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { PSINSAR_DATASET } from '@/lib/geo/datasetConfig'
import { fetchPsinsarPoints, PsinsarUnavailableError, type PsinsarPoint } from '@/lib/psinsar/psinsarClient'

// I dati PSInSAR sono aggiornati su base annuale/pluriennale (a differenza del
// satellite Sentinel-2, settimanale) — TTL lungo, stesso pattern bbox-keyed
// lazy-cleanup di poi_cache/pai_polygon_cache.
const PSINSAR_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000

export async function fetchPsinsarPointsCached(bbox: string): Promise<PsinsarPoint[]> {
  if (!PSINSAR_DATASET.baseUrl || !PSINSAR_DATASET.typeName) {
    throw new PsinsarUnavailableError('PSInSAR dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }
  const bboxKey = normalizeBboxKey(bbox)

  supabase.from('psinsar_point_cache').delete().lt('expires_at', new Date().toISOString())
    .then(({ error }) => { if (error) console.warn('[psinsar_point_cache] cleanup error:', error.message) })

  const { data: cached } = await supabase
    .from('psinsar_point_cache')
    .select('points')
    .eq('bbox_key', bboxKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (cached) return cached.points as PsinsarPoint[]

  const points = await fetchPsinsarPoints(bbox)

  const expiresAt = new Date(Date.now() + PSINSAR_CACHE_TTL_MS).toISOString()
  supabase.from('psinsar_point_cache')
    .upsert({ bbox_key: bboxKey, points, expires_at: expiresAt }, { onConflict: 'bbox_key' })
    .then(({ error }) => { if (error) console.error('[psinsar_point_cache] upsert error:', error.message) })

  return points
}
