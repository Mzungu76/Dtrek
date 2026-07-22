// Supabase-backed cache wrapper around dtmClient.ts's fetchDtmTile, same pattern as
// geologiaCache.ts/usoSuoloCache.ts. Without this every /api/tei-dtm request re-fetched and
// re-decoded a fresh GeoTIFF from OpenTopography from scratch — no caching at all, unlike its
// geologia/uso-suolo siblings — one of the drivers of Vercel Active CPU usage alongside the
// tei-terrain issue fixed in cf8b28d.
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { fetchDtmTile, DtmUnavailableError, type DtmTile } from '@/lib/dtm/dtmClient'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

// Terrain elevation doesn't change over time — same reasoning as geologia's 180-day TTL,
// treated as quasi-permanent rather than uso-suolo's shorter 30-day (land cover) TTL.
const DTM_CACHE_TTL_MS = 180 * 24 * 60 * 60 * 1000

// Same reasoning as geologiaCache.ts's CACHE_LOOKUP_TIMEOUT_MS — a stalled Supabase
// connection shouldn't be able to hold the request past a normal cache-miss cost.
const CACHE_LOOKUP_TIMEOUT_MS = 5000

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// jsonb can't store a Float64Array directly (round-trips as a plain object, not an array) —
// serialize/deserialize elevations as a regular number[], same trick uso_suolo_cache already
// documents for classCodes.
interface StoredDtmTile extends Omit<DtmTile, 'elevations'> {
  elevations: number[]
}

export async function fetchDtmTileCached(bbox: string): Promise<DtmTile | null> {
  if (!process.env.OPENTOPOGRAPHY_API_KEY) {
    throw new DtmUnavailableError('OPENTOPOGRAPHY_API_KEY not set (see .env.example)')
  }
  const bboxKey = normalizeBboxKey(bbox)

  if (shouldRunCleanup('dtm_cache')) {
    supabase.from('dtm_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[dtm_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await withTimeout(
    supabase
      .from('dtm_cache')
      .select('tile')
      .eq('bbox_key', bboxKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    CACHE_LOOKUP_TIMEOUT_MS,
  ).catch(() => ({ data: null }))
  // Un tile salvato è una tile vera (un risultato positivo non cambia nel tempo, da qui il TTL di
  // 180 giorni). Un `tile: null` salvato invece era un FALLIMENTO al momento della scrittura — che
  // sia stato causato da un rate limit momentaneo, un timeout, o una chiave momentaneamente non
  // valida, non lo sappiamo più a posteriori, ma trattarlo come "niente da vedere qui per 180
  // giorni" (stesso TTL di un successo) blocca ogni nuovo tentativo per mezzo anno anche se la
  // causa reale si è già risolta da tempo — a differenza di un vero limite di copertura del DEM
  // (raro per l'Italia, il dataset EU_DTM la copre quasi per intero), che sì lo giustificherebbe.
  // Qui si tratta quindi come un cache-miss: si ritenta dal vivo invece di fidarsi del nulla salvato.
  if (cached?.tile) {
    const stored = cached.tile as StoredDtmTile
    return { ...stored, elevations: Float64Array.from(stored.elevations) }
  }

  const tile = await fetchDtmTile(bbox)

  // Solo un risultato positivo viene cachato (vedi sopra) — un fallimento resta un fatto
  // dell'istante, da ritentare alla prossima richiesta invece di restare scritto per 180 giorni.
  if (tile) {
    const expiresAt = new Date(Date.now() + DTM_CACHE_TTL_MS).toISOString()
    const storedTile: StoredDtmTile = { ...tile, elevations: Array.from(tile.elevations) }
    supabase.from('dtm_cache')
      .upsert({ bbox_key: bboxKey, tile: storedTile, expires_at: expiresAt }, { onConflict: 'bbox_key' })
      .then(({ error }) => { if (error) console.error('[dtm_cache] upsert error:', error.message) })
  }

  return tile
}
