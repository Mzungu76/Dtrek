// Supabase-backed cache wrapper around usoSuoloClient.ts's fetchUsoSuoloTile. Split into its
// own file for the same reason as paiCache.ts: keeps lib/supabase.ts's import-time env-var
// check out of usoSuoloClient.ts, so scripts/probe-usosuolo.ts can run without Supabase
// configured.
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { USO_SUOLO_DATASET } from '@/lib/geo/datasetConfig'
import { fetchUsoSuoloTile, UsoSuoloUnavailableError, type UsoSuoloTile } from '@/lib/usosuolo/usoSuoloClient'

// Il land cover cambia su scala stagionale/annuale (incendi, disboscamento, stagioni) — TTL
// più corto di geologia/PAI (180gg), non vale trattarlo come quasi-permanente.
const USO_SUOLO_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

// Same reasoning as geologiaCache.ts's CACHE_LOOKUP_TIMEOUT_MS — a stalled Supabase
// connection shouldn't be able to hold the request past a normal cache-miss cost.
const CACHE_LOOKUP_TIMEOUT_MS = 5000

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function fetchUsoSuoloTileCached(bbox: string): Promise<UsoSuoloTile | null> {
  if (!USO_SUOLO_DATASET.baseUrl || !USO_SUOLO_DATASET.typeName) {
    throw new UsoSuoloUnavailableError('Uso suolo dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }
  const bboxKey = normalizeBboxKey(bbox)

  supabase.from('uso_suolo_cache').delete().lt('expires_at', new Date().toISOString())
    .then(({ error }) => { if (error) console.warn('[uso_suolo_cache] cleanup error:', error.message) })

  const { data: cached } = await withTimeout(
    supabase
      .from('uso_suolo_cache')
      .select('tile')
      .eq('bbox_key', bboxKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    CACHE_LOOKUP_TIMEOUT_MS,
  ).catch(() => ({ data: null }))
  if (cached) return cached.tile as UsoSuoloTile | null

  const tile = await fetchUsoSuoloTile(bbox)

  const expiresAt = new Date(Date.now() + USO_SUOLO_CACHE_TTL_MS).toISOString()
  supabase.from('uso_suolo_cache')
    .upsert({ bbox_key: bboxKey, tile, expires_at: expiresAt }, { onConflict: 'bbox_key' })
    .then(({ error }) => { if (error) console.error('[uso_suolo_cache] upsert error:', error.message) })

  return tile
}
