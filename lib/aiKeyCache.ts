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
  // Il database Redis di questo progetto è collegato tramite l'integrazione "Vercel KV" (non lo
  // standalone Upstash Marketplace) — le variabili generate si chiamano KV_REST_API_URL/TOKEN,
  // non le UPSTASH_REDIS_REST_* lette di default da Redis.fromEnv().
  const url   = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  client = url && token ? new Redis({ url, token }) : null
  return client
}

export interface CachedAiSettings {
  apiKey: string
  userGender: string
  breveSections: string[]
  /** Scelta esplicita dell'utente (user_settings.claude_model), non ancora risolta contro il
   *  default per funzionalità — null quando l'utente non ha scelto nulla. La risoluzione al
   *  default giusto (diverso per funzionalità, vedi lib/claudeModels.ts) avviene solo lato
   *  lettura, in resolveApiKeyAndSettings.ts — cachear già un valore risolto legherebbe per
   *  errore ogni funzionalità al default di quella che ha scritto la cache per prima. */
  claudeModel: string | null
  /** Consenso dell'utente all'uso di dati personali/ricerca web nei prompt AI — vedi
   *  app/lib/guide/resolveApiKeyAndSettings.ts e components/profilo/SectionAiPrivacy.tsx. */
  aiUseBiometricData: boolean
  aiUseHistoryData: boolean
  aiUseWebSearch: boolean
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

// ── Chiave AI di emergenza condivisa ────────────────────────────────────────
//
// Quando Supabase è del tutto irraggiungibile e non è nemmeno possibile verificare CHI sta
// chiedendo (vedi lib/supabaseAuth.ts, JWKS anch'esse su Supabase quindi anch'esse irraggiungibili
// in un blackout totale), l'identificazione per-utente va abbandonata: in emergenza, la stessa
// chiave (process.env.ANTHROPIC_API_KEY, pagata dal gestore dell'app) viene usata per chiunque
// abbia un cookie di sessione presente (non verificato — solo per escludere richieste del tutto
// anonime). Scelta esplicita dell'utente: "è un'emergenza, l'app se ne assume le responsabilità".
//
// Interruttore manuale su Upstash, per spegnerla se il blackout si prolunga troppo:
//   SET dtrek:emergency-shared-key-enabled false   → disabilita
//   DEL dtrek:emergency-shared-key-enabled          (o "true") → riabilita — abilitata di default.
const EMERGENCY_KEY_FLAG = 'dtrek:emergency-shared-key-enabled'

export async function isEmergencySharedKeyEnabled(): Promise<boolean> {
  const redis = getClient()
  if (!redis) return true  // nessun Redis configurato: non è questo a dover bloccare l'emergenza
  try {
    const v = await redis.get<string>(EMERGENCY_KEY_FLAG)
    return v !== 'false'  // abilitata di default, finché non viene spenta esplicitamente
  } catch {
    return true
  }
}
