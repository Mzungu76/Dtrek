// Supabase-backed cache wrapper around osmGraph.ts's fetchWalkNetwork, stesso identico pattern di
// lib/dtm/dtmCache.ts's fetchDtmTileCached. Senza questa cache, ogni generazione "Su misura" (dal
// wizard o dal cron di Percorsi per te) riscaricava da zero l'intera rete percorribile del bbox —
// il passo più pesante di tutta la pipeline, causa dominante dei timeout osservati in produzione,
// specialmente per richieste ripetute nella stessa zona (un ritentativo, il cron settimanale sullo
// stesso centroide, utenti vicini).
import { normalizeBboxKey } from '@/lib/geoUtils'
import { supabase } from '@/lib/supabase'
import { fetchWalkNetwork, type WalkNetwork, type GraphNode } from '@/lib/routeBuilder/osmGraph'
import { shouldRunCleanup } from '@/lib/cacheCleanupThrottle'

// Più corto dei 180 giorni del DTM (l'orografia non cambia, la rete cammini un po' di più — un
// sentiero può chiudere, un nuovo tratto può comparire), ma non così breve come uso_suolo_cache
// (30gg, copertura vegetale stagionale): 45 giorni è un compromesso ragionevole.
const WALK_NETWORK_CACHE_TTL_MS = 45 * 24 * 60 * 60 * 1000

// Stessa ragione di dtmCache.ts's CACHE_LOOKUP_TIMEOUT_MS — una connessione Supabase bloccata non
// deve poter costare più di un normale cache-miss.
const CACHE_LOOKUP_TIMEOUT_MS = 5000

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// jsonb non può contenere una Map — serializzata come lista di coppie [nodeId, GraphNode],
// ricostruita in Map alla lettura.
type StoredNetwork = [number, GraphNode][]

function serialize(network: WalkNetwork): StoredNetwork {
  return Array.from(network.nodes.entries())
}

function deserialize(stored: StoredNetwork): WalkNetwork {
  return { nodes: new Map(stored) }
}

// `awaitWrite`: di norma la scrittura in cache dopo un fetch a freddo è non bloccante (un
// fallimento non deve mai far fallire la generazione, solo lasciare quella zona senza cache per
// questo giro). La pipeline "Su misura" a step (lib/routeBuilder/buildSteps.ts's prepareNetworkStep,
// chiamata da app/api/route-build/step/network/route.ts) è l'eccezione: lo step successivo
// (step/candidates) rilegge la rete dalla stessa cache in una richiesta HTTP separata, quindi qui
// la scrittura deve essere GARANTITA completa prima di rispondere al client — altrimenti lo step 2
// rischierebbe un cache-miss e un fetch Overpass a freddo ripetuto, vanificando il vantaggio della
// cache proprio nel caso in cui serve di più.
export async function fetchWalkNetworkCached(bbox: [number, number, number, number], awaitWrite = false): Promise<WalkNetwork> {
  const bboxKey = normalizeBboxKey(bbox.join(','))

  if (shouldRunCleanup('walk_network_cache')) {
    supabase.from('walk_network_cache').delete().lt('expires_at', new Date().toISOString())
      .then(({ error }) => { if (error) console.warn('[walk_network_cache] cleanup error:', error.message) })
  }

  const { data: cached } = await withTimeout(
    supabase
      .from('walk_network_cache')
      .select('network')
      .eq('bbox_key', bboxKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    CACHE_LOOKUP_TIMEOUT_MS,
  ).catch(() => ({ data: null }))

  if (cached?.network) {
    return deserialize(cached.network as StoredNetwork)
  }

  // Nessun hit — fetch dal vivo. Un fallimento (Overpass irraggiungibile) si propaga come
  // eccezione, esattamente come prima di questa cache: il chiamante (executeBuild) lo gestisce già.
  const network = await fetchWalkNetwork(bbox)

  const expiresAt = new Date(Date.now() + WALK_NETWORK_CACHE_TTL_MS).toISOString()
  const upsert = supabase.from('walk_network_cache')
    .upsert({ bbox_key: bboxKey, network: serialize(network), expires_at: expiresAt }, { onConflict: 'bbox_key' })

  if (awaitWrite) {
    const { error } = await upsert
    if (error) console.error('[walk_network_cache] upsert error:', error.message)
  } else {
    upsert.then(({ error }) => { if (error) console.error('[walk_network_cache] upsert error:', error.message) })
  }

  return network
}
