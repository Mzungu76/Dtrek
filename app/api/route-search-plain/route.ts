import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveAreaBbox, searchHikingRoutesByName, type HikingRouteCandidate } from '@/lib/overpassTrails'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Ricerca per nome/zona direttamente su OpenStreetMap (Overpass), nessun LLM coinvolto — a
// differenza di app/api/route-search/route.ts non produce descrizioni, verdetti di comfort né
// candidati "inventati": solo ciò che esiste davvero come relazione hiking su OSM. Stessa identità
// "plausibile ma non verificabile" durante un blackout usata da route-search/resolve, per lo
// stesso motivo: nessuna lettura/scrittura per-utente, solo Overpass e Nominatim (pubblici).
export async function POST(req: NextRequest) {
  const { user, authUnavailable, degraded } = await getUserFromRequestDetailed(req)
  if (!user && !degraded) {
    return NextResponse.json(
      authUnavailable
        ? { error: 'auth_unavailable', message: 'Supabase non raggiungibile — riprova tra poco.' }
        : { error: 'Non autenticato' },
      { status: authUnavailable ? 503 : 401 },
    )
  }

  let name: string
  let area: string | undefined
  try {
    const body = await req.json()
    if (typeof body.name !== 'string' || !body.name.trim()) throw new Error('name mancante')
    name = body.name.trim().slice(0, 120)
    area = typeof body.area === 'string' && body.area.trim() ? body.area.trim().slice(0, 120) : undefined
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  let candidates: HikingRouteCandidate[] = []
  try {
    const bbox = area ? await resolveAreaBbox(area) : null
    candidates = await searchHikingRoutesByName(name, bbox, 8)
  } catch (e) {
    console.error('[api/route-search-plain] ricerca Overpass fallita:', e)
    return NextResponse.json({ error: 'Ricerca non riuscita, riprova.' }, { status: 502 })
  }

  return NextResponse.json({ candidates })
}
