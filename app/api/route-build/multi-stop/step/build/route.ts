// Step 2/3 della pipeline multi-tappa: rilegge la rete percorribile dalla cache scritta dallo step
// precedente (cache-hit quasi istantaneo) ed esegue il pathfinding vero e proprio — vedi
// lib/routeBuilder/multiStopSteps.ts per il perché della suddivisione.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { fetchWalkNetworkCached } from '@/lib/routeBuilder/walkNetworkCache'
import { buildMultiStopRoute, type MultiStopMode, type MultiStopLeg } from '@/lib/routeBuilder/multiStopRoute'
import type { MultiStopFullStop } from '@/lib/routeBuilder/multiStopSteps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface BuildRequestBody {
  bbox: [number, number, number, number]
  fullStops: MultiStopFullStop[]
  mode: MultiStopMode
  targetDistanceKm: number | null
  knownTrailWayIds: number[]
}

function parseBody(raw: unknown): BuildRequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  const bbox = body.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Bbox non valido')
  }
  if (!Array.isArray(body.fullStops) || body.fullStops.length < 2) throw new Error('fullStops non valido')
  const fullStops: MultiStopFullStop[] = body.fullStops.map((s: unknown, i: number) => {
    const p = s as Record<string, unknown>
    const lat = Number(p.lat)
    const lon = Number(p.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('tappa non valida')
    return { id: typeof p.id === 'string' ? p.id : String(i), name: typeof p.name === 'string' ? p.name : '', lat, lon }
  })
  const mode = body.mode === 'urbano' || body.mode === 'naturalistico' ? body.mode : 'misto'
  const distRaw = Number(body.targetDistanceKm)
  const targetDistanceKm = body.targetDistanceKm != null && Number.isFinite(distRaw) ? distRaw : null
  const knownTrailWayIds = Array.isArray(body.knownTrailWayIds) ? body.knownTrailWayIds.map(Number).filter(Number.isFinite) : []

  return { bbox: bbox as [number, number, number, number], fullStops, mode, targetDistanceKm, knownTrailWayIds }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/multi-stop/step/build] Errore imprevisto:', e)
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let params: BuildRequestBody
  try {
    params = parseBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  let network
  try {
    // false: nessuna scrittura da garantire qui, solo lettura (cache-hit atteso, scritta dallo
    // step precedente) — se per qualche motivo non c'è più (TTL scaduto tra i due step, evento
    // raro dato il TTL di 45gg), fetchWalkNetworkCached ricade comunque su un fetch Overpass dal vivo.
    network = await fetchWalkNetworkCached(params.bbox, false)
  } catch (e) {
    console.error('[route-build/multi-stop/step/build] fetchWalkNetwork failed:', e)
    return NextResponse.json({ error: 'network_unavailable', message: 'Rete pedonale non disponibile in questo momento, riprova.' }, { status: 502 })
  }

  // targetDistanceKm*1000: cerca il cammino più vicino a questa distanza tratta per tratta (non
  // semplicemente il più breve) quando è più lungo della somma dei cammini minimi — vedi
  // lib/routeBuilder/multiStopRoute.ts. Sempre un risultato: un tratto irraggiungibile ripiega su
  // una linea d'aria SOLO per quella tratta (leg.real === false), mai un fallimento totale.
  const outcome = buildMultiStopRoute(
    network, params.fullStops, params.mode,
    params.targetDistanceKm != null ? params.targetDistanceKm * 1000 : null,
    new Set(params.knownTrailWayIds),
  )

  // Logging diagnostico per ogni tratta in ripiego a linea d'aria — mai mostrato all'utente (vedi
  // MultiStopLeg.diagnostic in multiStopRoute.ts), serve solo a distinguere in produzione, quando
  // il sintomo si ripresenta, quale delle cause plausibili è quella reale: budget di nodi esaurito
  // (una connessione potrebbe comunque esistere) vs rete esplorata per intero senza trovare il
  // bersaglio (nessun cammino esiste nel bbox scaricato — dati insufficienti, non un limite di
  // ricerca). Vedi docs/crea-guida-itinerario-personalizzato-stato.md.
  for (const leg of outcome.legs) {
    if (leg.real) continue
    const from = params.fullStops[leg.fromStopIdx]
    const to = params.fullStops[leg.toStopIdx]
    console.warn(
      `[route-build/multi-stop/step/build] ripiego a linea d'aria: "${from?.name}" -> "${to?.name}"`,
      `reason=${leg.fallbackReason} airlineM=${Math.round(leg.distanceM)} mode=${params.mode} networkNodes=${network.nodes.size}`,
      leg.diagnostic
        ? `preferred(visited=${leg.diagnostic.preferred.nodesVisited},budgetExhausted=${leg.diagnostic.preferred.budgetExhausted})` +
          (leg.diagnostic.fallback ? ` fallback(visited=${leg.diagnostic.fallback.nodesVisited},budgetExhausted=${leg.diagnostic.fallback.budgetExhausted})` : ' fallback=not_attempted')
        : 'diagnostic=n/a (snap alla rete fallito, too_far_from_network)',
    )
  }

  // Concatena i tratti in un'unica polyline — scarta il primo punto di ogni tratto dopo il primo,
  // che reconstructPath ripete identico all'ultimo punto del tratto precedente (entrambi partono
  // esattamente dal nodo di aggancio condiviso). Una linea d'aria di ripiego ha comunque solo 2
  // punti (i due estremi), lo stesso schema si applica senza distinzioni.
  const routePolyline: [number, number][] = []
  let distanceM = 0
  outcome.legs.forEach((leg: MultiStopLeg, i: number) => {
    routePolyline.push(...(i === 0 ? leg.polyline : leg.polyline.slice(1)))
    distanceM += leg.distanceM
  })

  return NextResponse.json({ legs: outcome.legs, routePolyline, distanceM })
}
