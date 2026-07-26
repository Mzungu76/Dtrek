// Ricerca "Esistenti" — pipeline monolitica, mantenuta come endpoint per compatibilità (vedi
// app/api/route-build/step/search-find e step/search-resolve per la stessa logica spezzata in due
// chiamate HTTP brevi, usata dal client — components/upload/RouteBuilder.tsx). Logica condivisa in
// lib/routeBuilder/searchSteps.ts, nessuna duplicazione.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'
import {
  findExistingRoutesForQuery, resolveFoundRoutesWithPoi, sanitizeSearchRadiusKm, MAX_EAGER_RESOLVE,
  type FoundRouteResult,
} from '@/lib/routeBuilder/searchSteps'
import { padBbox } from '@/lib/overpassTrails'
import type { Bbox } from '@/lib/routeBuilder/hikingProbability'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Ri-esportato (invariato) perché components/upload/RouteBuilder.tsx lo importa da qui — definito
// canonicamente in lib/routeBuilder/searchSteps.ts (condiviso anche dai due endpoint a step).
export type { FoundRouteResult }

// Ricerca a livelli per il wizard "Costruisci o trova un percorso" (components/upload/RouteBuilder.tsx):
// Livello 0 (sempre, gratuito) → Livello 1 (solo se il Livello 0 non trova nulla, e solo con AI
// attiva + chiave personale) → altrimenti `escalateToAi` segnala al client di aprire la chat
// completa di Giulia (Livello 2, /api/route-search, non gestito qui perché conversazionale).
//
// Tutto il corpo gira dentro handlePost/try-catch di POST: senza questa rete di sicurezza
// un'eccezione imprevista (es. la piattaforma che termina la funzione oltre maxDuration) può
// risultare in una risposta non-JSON che il client legge come "errore di rete" generico,
// mascherando la causa reale.
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/search] Errore imprevisto:', e)
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

  const startedAt = Date.now()
  const find = await findExistingRoutesForQuery(user, query, radiusKm, useAi)
  // find.probabilityRoutes è già completamente risolto (ripiego "probabilità" di searchSteps.ts,
  // usato solo quando find.candidates è vuoto) — va unito qui. Quando invece dei candidati relation
  // esistono, passiamo comunque un bbox a resolveFoundRoutesWithPoi: prova il ripiego IN PARALLELO
  // alla risoluzione delle relation, usato solo se quella risoluzione non produce nulla (vedi
  // searchSteps.ts) — trovare una relation non garantisce che la sua traccia si risolva davvero.
  const probabilityBbox = find.place
    ? (padBbox([find.place.lat, find.place.lon, find.place.lat, find.place.lon], radiusKm) as Bbox)
    : null
  const foundRoutes = [
    ...(await resolveFoundRoutesWithPoi(find.candidates, MAX_EAGER_RESOLVE, null, probabilityBbox)),
    ...find.probabilityRoutes,
  ]

  await logRouteBuildEvent({
    userId: user?.id ?? null,
    kind: 'search',
    query,
    useAi,
    tierReached: find.escalateToAi ? `${find.tierReached}_escalated` : find.tierReached,
    placeName: find.place?.displayName ?? null,
    foundCount: foundRoutes.length,
    escalatedToAi: find.escalateToAi,
    durationMs: Date.now() - startedAt,
    details: { interpretedPlacesCount: find.interpretedPlacesCount, radiusKm },
  })

  return NextResponse.json({ place: find.place, prefill: find.prefill, foundRoutes, escalateToAi: find.escalateToAi })
}
