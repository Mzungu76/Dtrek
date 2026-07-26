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
  let destination: { lat: number; lon: number } | null
  let fallbackPoint: { lat: number; lon: number } | null
  let skipNameResolution: boolean
  try {
    const body = await req.json()
    if (typeof body.query !== 'string') throw new Error('query mancante')
    query = body.query.trim().slice(0, 300)
    useAi = body.useAi === true
    radiusKm = sanitizeSearchRadiusKm(body.radiusKm)
    destination = typeof body.destLat === 'number' && typeof body.destLon === 'number'
      ? { lat: body.destLat, lon: body.destLon } : null
    // Punto già noto lato client (mappa già centrata lì — da una risoluzione client-side riuscita o
    // da un tocco diretto) — usato come fallback se la risoluzione server-side del testo fallisce
    // (Nominatim spesso limita/blocca le chiamate da IP server/cloud, vedi
    // lib/routeBuilder/resolvePlaceClient.ts), invece di far fallire l'intera ricerca quando le
    // coordinate giuste sono in realtà già note.
    fallbackPoint = typeof body.fallbackLat === 'number' && typeof body.fallbackLon === 'number'
      ? { lat: body.fallbackLat, lon: body.fallbackLon } : null
    // Un testo vuoto è valido SOLO se il client ha già un punto (tocco diretto sulla mappa, vedi
    // RouteBuilder.tsx's runSearch) — senza query e senza punto non c'è nulla da cercare.
    if (!query && !fallbackPoint) throw new Error('query o punto mancante')
    // true quando il client passa `placeConfirmed` (testo già risolto/confermato in un passo
    // precedente, vedi RouteBuilder.tsx's queryMapConfirmed) o quando non c'è testo (tocco diretto,
    // sempre "confermato" per definizione) — in entrambi i casi il punto è già affidabile, salta la
    // cascata di risoluzione testuale server-side (vedi findTier0).
    skipNameResolution = !query || body.placeConfirmed === true
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const find = await findExistingRoutesForQuery(user, query, radiusKm, useAi, destination, fallbackPoint, skipNameResolution)
  return NextResponse.json(find)
}
