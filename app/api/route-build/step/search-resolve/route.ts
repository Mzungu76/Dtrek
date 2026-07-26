// Step 2/2 della ricerca "Esistenti" a step (vedi step/search-find/route.ts per il primo step e il
// perché della suddivisione): risolve fino a MAX_EAGER_RESOLVE candidati con una traccia reale, POI
// vicini e una stima provvisoria di Sicurezza/Trail Score — isolato in una richiesta a parte con un
// proprio tetto di 60s, invece di sommarsi alla ricerca dei candidati.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveFoundRoutesWithPoi, MAX_EAGER_RESOLVE } from '@/lib/routeBuilder/searchSteps'
import { padBbox, type HikingRouteCandidate } from '@/lib/overpassTrails'
import type { Bbox } from '@/lib/routeBuilder/hikingProbability'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Tetto morbido con margine sul tetto duro di 60s della piattaforma — stesso principio di
// app/api/route-build/route.ts (vedi quel file per il perché): fino a MAX_EAGER_RESOLVE risoluzioni
// Overpass in parallelo, ciascuna potenzialmente lenta, rispondere con un risultato vuoto ma
// spiegato prima del kill è sempre meglio di nessuna risposta.
const SOFT_DEADLINE_MS = 45_000

function parseCandidate(raw: unknown): HikingRouteCandidate | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const id = Number(c.id)
  if (!Number.isFinite(id) || typeof c.name !== 'string') return null
  return {
    id, name: c.name, hasName: c.hasName === true,
    ref: typeof c.ref === 'string' ? c.ref : undefined,
    network: typeof c.network === 'string' ? c.network : undefined,
    lat: typeof c.lat === 'number' ? c.lat : undefined,
    lon: typeof c.lon === 'number' ? c.lon : undefined,
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/step/search-resolve] Errore imprevisto:', e)
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

  const body = await req.json().catch(() => null)
  const rawCandidates = Array.isArray(body?.candidates) ? body.candidates : []
  const candidates = rawCandidates.map(parseCandidate).filter((c: HikingRouteCandidate | null): c is HikingRouteCandidate => c != null)
  const destination = typeof body?.destLat === 'number' && typeof body?.destLon === 'number'
    ? { lat: body.destLat, lon: body.destLon } : null
  // Trovare candidati relation non garantisce che la loro traccia si risolva davvero (relation
  // lontane/incomplete possono fallire) — se il chiamante passa il luogo già risolto (vedi
  // RouteBuilder.tsx, che lo ha da step/search-find), il ripiego "probabilità" gira IN PARALLELO
  // alla risoluzione delle relation invece che dopo un eventuale fallimento, entro lo stesso tetto.
  const radiusKm = typeof body?.radiusKm === 'number' ? body.radiusKm : null
  const probabilityBbox: Bbox | null = typeof body?.placeLat === 'number' && typeof body?.placeLon === 'number' && radiusKm
    ? (padBbox([body.placeLat, body.placeLon, body.placeLat, body.placeLon], radiusKm) as Bbox)
    : null

  const outcome = await Promise.race([
    resolveFoundRoutesWithPoi(candidates, MAX_EAGER_RESOLVE, destination, probabilityBbox).then(foundRoutes => ({ kind: 'done' as const, foundRoutes })),
    new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), SOFT_DEADLINE_MS)),
  ])
  if (outcome.kind === 'timeout') {
    console.error(`[route-build/step/search-resolve] tetto morbido di ${SOFT_DEADLINE_MS}ms superato, rispondo prima del kill della piattaforma`)
    return NextResponse.json({ foundRoutes: [], message: 'La risoluzione dei percorsi ha impiegato troppo tempo, riprova.' })
  }
  return NextResponse.json({ foundRoutes: outcome.foundRoutes })
}
