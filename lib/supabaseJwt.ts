import { jwtVerify, createLocalJWKSet, type JSONWebKeySet } from 'jose'
import { Redis } from '@upstash/redis'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const JWKS_URL = SUPABASE_URL ? new URL('/auth/v1/.well-known/jwks.json', SUPABASE_URL) : null

// Questo progetto usa chiavi di firma asimmetriche (ECC P-256 / ES256, vedi Supabase → Settings →
// API → JWT Keys) — nessun segreto condiviso da gestire, le chiavi qui sono pubbliche per
// costruzione. Ma il set di chiavi si scarica anch'esso da supabase.co: durante un blackout che
// coinvolge l'intero dominio (non solo l'endpoint di auth) anche QUESTO fetch fallisce, vanificando
// la verifica "offline" — vedi getJwks() sotto per la copia di riserva che risolve il problema.
let redisClient: Redis | null | undefined
function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient
  const url   = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  redisClient = url && token ? new Redis({ url, token }) : null
  return redisClient
}

const JWKS_CACHE_KEY = 'dtrek:jwks'
const JWKS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30  // le chiavi JWKS sono pubbliche e ruotano di rado

let memoryJwks: JSONWebKeySet | null = null  // per istanza serverless "calda" — evita un fetch/una lettura Redis ad ogni richiesta

async function fetchLiveJwks(): Promise<JSONWebKeySet | null> {
  if (!JWKS_URL) return null
  try {
    const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json() as JSONWebKeySet
  } catch {
    return null
  }
}

/**
 * Chiamata sul percorso "tutto ok" (supabase.auth.getUser() riuscito, vedi lib/supabaseAuth.ts) —
 * tiene aggiornata su Redis la copia di riserva delle chiavi pubbliche del progetto, così è già
 * pronta quando serve davvero: durante un blackout, quando il fetch diretto qui sotto fallirebbe.
 * Non fa nulla se questa istanza ha già le chiavi in memoria — un fetch per istanza "calda" basta,
 * non serve rifarlo ad ogni richiesta.
 */
export async function refreshJwksCache(): Promise<void> {
  if (memoryJwks) return
  const jwks = await fetchLiveJwks()
  if (!jwks) return
  memoryJwks = jwks
  const redis = getRedis()
  if (redis) void redis.set(JWKS_CACHE_KEY, jwks, { ex: JWKS_CACHE_TTL_SECONDS }).catch(() => {})
}

async function getJwks(): Promise<JSONWebKeySet | null> {
  if (memoryJwks) return memoryJwks
  const live = await fetchLiveJwks()
  if (live) { memoryJwks = live; return live }
  const redis = getRedis()
  if (!redis) return null
  try {
    const cached = await redis.get<JSONWebKeySet>(JWKS_CACHE_KEY)
    if (cached) memoryJwks = cached
    return cached
  } catch {
    return null
  }
}

export interface LocalJwtUser {
  id: string
  email?: string
}

/**
 * Verifica localmente la firma di un access token Supabase — usata SOLO come fallback quando la
 * verifica live (supabase.auth.getUser(), lib/supabaseAuth.ts) fallisce per un problema di rete,
 * non la sostituisce: qui un token resta valido fino alla sua scadenza naturale (non rileva una
 * revoca di sessione avvenuta nel frattempo), mentre la verifica live è sempre la fonte di verità
 * quando è raggiungibile. Ritorna null su firma non valida, scaduta, o chiavi JWKS irraggiungibili
 * sia in diretta che dalla copia di riserva — mai un errore che possa far cadere il chiamante.
 */
export async function verifySupabaseJwtLocally(accessToken: string): Promise<LocalJwtUser | null> {
  const jwks = await getJwks()
  if (!jwks) return null
  try {
    const { payload } = await jwtVerify(accessToken, createLocalJWKSet(jwks))
    if (typeof payload.sub !== 'string' || payload.aud !== 'authenticated') return null
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }
  } catch {
    return null
  }
}
