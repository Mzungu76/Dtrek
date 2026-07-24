// Step 1/3 della pipeline "Su misura" a step (vedi app/api/route-build/route.ts per la versione
// monolitica, mantenuta invariata per compatibilità, e components/upload/RouteBuilder.tsx per
// l'orchestrazione lato client): profilo utente, calcolo bbox, fetch/cache della rete percorribile,
// aggancio al nodo di partenza — l'unico passo che tocca Overpass "a freddo" (fino a ~37s nel caso
// peggiore, vedi lib/routeBuilder/osmGraph.ts), isolato in una richiesta a parte proprio per non
// sommarsi al pathfinding (step/candidates) e all'arricchimento (step/enrich) dentro lo stesso
// tetto di 60s — la causa concreta, misurata in produzione, di circa metà dei tentativi "Su misura"
// che finivano in timeout con zero risultati (vedi /profilo/log-ricerche).
//
// La rete percorribile stessa (potenzialmente decine di migliaia di nodi) NON viaggia mai sul
// filo verso il client: resta solo nella cache server-side (walk_network_cache, scrittura
// GARANTITA qui — awaitCacheWrite:true — perché step/candidates deve poterla rileggere in una
// richiesta separata), il client riceve solo bbox/startNodeId, dati leggeri sufficienti per
// richiamare lo step successivo.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { prepareNetworkStep, parseBuildRequestBody } from '@/lib/routeBuilder/buildSteps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/step/network] Errore imprevisto:', e)
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
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

  let params
  try {
    params = parseBuildRequestBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  // awaitCacheWrite:true — a differenza della pipeline monolitica, qui la scrittura in cache deve
  // essere garantita completa prima di rispondere: app/api/route-build/step/candidates/route.ts
  // rilegge la stessa rete in una richiesta HTTP separata (vedi lib/routeBuilder/walkNetworkCache.ts).
  const outcome = await prepareNetworkStep(user, params, true)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error, message: outcome.message }, { status: outcome.status })
  }

  const { bbox, startNodeId, targetDistanceM, hasDestination, rawCandidates, concerns, environmentPrefs } = outcome.prep
  return NextResponse.json({ bbox, startNodeId, targetDistanceM, hasDestination, rawCandidates, concerns, environmentPrefs })
}
