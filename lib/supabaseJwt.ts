import { jwtVerify, createRemoteJWKSet } from 'jose'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

// createRemoteJWKSet mette in cache le chiavi pubbliche del progetto dopo il primo recupero, quindi
// su un'istanza serverless già "calda" la verifica seguente non richiede alcuna chiamata di rete —
// a differenza di supabase.auth.getUser(), che la fa sempre. Questo progetto usa chiavi di firma
// asimmetriche (ECC P-256 / ES256, vedi Supabase → Settings → API → JWT Keys), quindi non serve
// nessun segreto condiviso: le chiavi qui sono pubbliche per costruzione.
const jwks = SUPABASE_URL
  ? createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', SUPABASE_URL))
  : null

export interface LocalJwtUser {
  id: string
  email?: string
}

/**
 * Verifica localmente la firma di un access token Supabase — usata SOLO come fallback quando la
 * verifica live (supabase.auth.getUser(), lib/supabaseAuth.ts) fallisce per un problema di rete,
 * non la sostituisce: qui un token resta valido fino alla sua scadenza naturale (non rileva una
 * revoca di sessione avvenuta nel frattempo), mentre la verifica live è sempre la fonte di verità
 * quando è raggiungibile. Ritorna null su firma non valida, scaduta, o JWKS non configurabile
 * (NEXT_PUBLIC_SUPABASE_URL assente) — mai un errore che possa far cadere il chiamante.
 */
export async function verifySupabaseJwtLocally(accessToken: string): Promise<LocalJwtUser | null> {
  if (!jwks) return null
  try {
    const { payload } = await jwtVerify(accessToken, jwks)
    if (typeof payload.sub !== 'string' || payload.aud !== 'authenticated') return null
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }
  } catch {
    return null
  }
}
