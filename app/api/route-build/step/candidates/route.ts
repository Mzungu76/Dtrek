// Step 2/3 della pipeline "Su misura" a step (vedi app/api/route-build/step/network/route.ts per
// il primo step e il perché della suddivisione): rilegge la rete percorribile dalla cache scritta
// dallo step precedente (cache-hit quasi istantaneo, appena scritta con awaitCacheWrite:true) ed
// esegue il pathfinding vero e proprio — la parte CPU-bound della pipeline (Dijkstra ripetuto su
// più direzioni, vedi lib/routeBuilder/loopBuilder.ts), isolata in una richiesta a parte con un
// proprio tetto di 60s invece di sommarsi al fetch Overpass e all'arricchimento.
//
// Richiamato anche dal client per il ritentativo con lunghezze alternative (stessa identica
// chiamata, solo targetDistanceM diverso) — nessun endpoint dedicato al ritentativo, la logica di
// quando/come ritentare vive lato client (components/upload/RouteBuilder.tsx), qui c'è solo il
// calcolo puro per una data lunghezza.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { generateRawCandidatesForAnchors } from '@/lib/routeBuilder/buildSteps'
import type { RouteType } from '@/lib/routeBuilder/loopBuilder'
import { sanitizeHikerConcerns } from '@/lib/hikerProfile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CandidatesRequestBody {
  bbox: [number, number, number, number]
  // Uno o più (fino a 4: il punto esatto + fino a 3 ancore "libere" — vedi
  // lib/routeBuilder/buildSteps.ts's collectFreeAnchors) nodi da cui esplorare — sempre un array,
  // anche quando è uno solo, per un unico contratto client/server invece di due forme diverse.
  startNodeIds: number[]
  routeType: RouteType
  targetDistanceM: number
  // DTREK-AUDIT.md P2 #22 — già restituito dallo step precedente (step/network), il client lo
  // rimanda qui così il pathfinding stesso può evitare scalini/terreno tecnico quando l'utente li
  // ha dichiarati, non solo penalizzarli a valle nel punteggio finale (vedi loopBuilder.ts's
  // terrainCostMultiplier). Assente/non valido ⇒ nessun cambiamento di comportamento.
  concerns: ReturnType<typeof sanitizeHikerConcerns>
}

function parseBody(raw: unknown): CandidatesRequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  const bbox = body.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Bbox non valido')
  }
  const startNodeIds = Array.isArray(body.startNodeIds) ? body.startNodeIds.map(Number).filter(Number.isFinite) : []
  if (startNodeIds.length === 0) throw new Error('startNodeIds non valido')
  if (body.routeType !== 'anello' && body.routeType !== 'andata_ritorno' && body.routeType !== 'solo_andata') {
    throw new Error('Tipo di percorso non valido')
  }
  const targetDistanceM = Number(body.targetDistanceM)
  if (!Number.isFinite(targetDistanceM) || targetDistanceM <= 0) throw new Error('targetDistanceM non valido')
  const concerns = sanitizeHikerConcerns(Array.isArray(body.concerns) ? body.concerns : [])

  return { bbox: bbox as [number, number, number, number], startNodeIds, routeType: body.routeType, targetDistanceM, concerns }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/step/candidates] Errore imprevisto:', e)
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

  let params: CandidatesRequestBody
  try {
    params = parseBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  let network
  try {
    // false: nessuna scrittura da garantire qui, solo lettura (cache-hit atteso, scritta dallo
    // step precedente) — se per qualche motivo non c'è più (TTL scaduto tra i due step, evento raro
    // dato il TTL di 45gg), fetchWalkNetworkCached ricade comunque su un fetch Overpass dal vivo.
    network = await fetchWalkNetworkCached(params.bbox, false)
  } catch (e) {
    console.error('[route-build/step/candidates] fetchWalkNetwork failed:', e)
    return NextResponse.json({ error: 'network_unavailable', message: 'Rete sentieri non disponibile in questo momento, riprova.' }, { status: 502 })
  }

  const rawCandidates = generateRawCandidatesForAnchors(network, params.startNodeIds, params.routeType, params.targetDistanceM, 14, params.concerns)
  return NextResponse.json({ rawCandidates })
}
