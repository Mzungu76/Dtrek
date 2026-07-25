// Step 1/2 della ricerca "Esistenti" a step (vedi app/api/route-build/step/network/route.ts per lo
// stesso principio applicato a "Su misura"): risoluzione del luogo + elenco di candidati (Livello
// 0 gratuito, Livello 1 AI se necessario) — SENZA risolvere le tracce reali (quello è il passo
// successivo, step/search-resolve, isolato apposta perché è la parte più pesante e variabile,
// fino a 8 risoluzioni Overpass in parallelo).
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { findExistingRoutesForQuery, sanitizeSearchRadiusKm } from '@/lib/routeBuilder/searchSteps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/step/search-find] Errore imprevisto:', e)
    return NextResponse.json(
      { error: 'Errore interno', message: 'Ricerca non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let query: string
  let useAi: boolean
  let radiusKm: number
  try {
    const body = await req.json()
    if (typeof body.query !== 'string' || !body.query.trim()) throw new Error('query mancante')
    query = body.query.trim().slice(0, 300)
    useAi = body.useAi === true
    radiusKm = sanitizeSearchRadiusKm(body.radiusKm)
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const find = await findExistingRoutesForQuery(user, query, radiusKm, useAi)
  return NextResponse.json(find)
}
