import { Redis } from '@upstash/redis'

/**
 * Server-side, best-effort mirror of "user_id → chiave Claude personale + preferenze rilevanti
 * per la Guida", tenuto in Upstash Redis — un'infrastruttura indipendente da Supabase, così le
 * funzioni AI (guida, Chiedi a Giulia, confronto percorsi) restano utilizzabili anche quando
 * Supabase è del tutto irraggiungibile, non solo quando è irraggiungibile il suo servizio di
 * autenticazione (vedi lib/supabaseAuth.ts's getUserFromRequestDetailed per quella distinzione).
 *
 * Non tocca mai il browser: è una seconda copia lato server dello stesso segreto già presente in
 * Supabase (user_settings.claude_api_key), non un'esposizione nuova. Aggiornata ad ogni lettura
 * Supabase riuscita (write-through in app/lib/guide/resolveApiKeyAndSettings.ts) e letta solo
 * quando quella lettura fallisce — mai la fonte di verità primaria.
 *
 * Se le variabili d'ambiente Upstash non sono configurate, ogni funzione qui torna null/no-op in
 * silenzio: l'app si comporta esattamente come prima di questo modulo (nessuna resilienza extra,
 * ma nessun errore nuovo).
 */

let client: Redis | null | undefined

function getClient(): Redis | null {
  if (client !== undefined) return client
  try {
    client = Redis.fromEnv()
  } catch {
    client = null
  }
  return client
}

export interface CachedAiSettings {
  apiKey: string
  userGender: string
  breveSections: string[]
}

const TTL_SECONDS = 60 * 60 * 24 * 30  // 30 giorni — rinfrescata ad ogni lettura Supabase riuscita
const keyFor = (userId: string) => `dtrek:ai-settings:${userId}`

export async function readCachedAiSettings(userId: string): Promise<CachedAiSettings | null> {
  const redis = getClient()
  if (!redis) return null
  try {
    return await redis.get<CachedAiSettings>(keyFor(userId))
  } catch {
    return null
  }
}

export async function writeCachedAiSettings(userId: string, settings: CachedAiSettings): Promise<void> {
  const redis = getClient()
  if (!redis) return
  try {
    await redis.set(keyFor(userId), settings, { ex: TTL_SECONDS })
  } catch {
    // best-effort — non deve mai far fallire la richiesta principale che l'ha innescato
  }
}

export async function deleteCachedAiSettings(userId: string): Promise<void> {
  const redis = getClient()
  if (!redis) return
  try {
    await redis.del(keyFor(userId))
  } catch {
    // best-effort
  }
}
