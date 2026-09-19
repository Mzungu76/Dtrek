// Step 1/3 della pipeline multi-tappa (personalizzazione di un Borgo/Città, components/upload/
// PersonalizeItineraryPanel.tsx) — vedi lib/routeBuilder/multiStopSteps.ts per il perché della
// suddivisione e la logica condivisa con gli altri due step.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { prepareMultiStopNetworkStep, type MultiStopInput } from '@/lib/routeBuilder/multiStopSteps'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseBody(raw: unknown): { stops: MultiStopInput[]; considerExistingTrails: boolean } {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  if (!Array.isArray(body.stops) || body.stops.length < 2) throw new Error('stops mancanti')
  const stops: MultiStopInput[] = body.stops.map((s: unknown, i: number) => {
    const p = s as Record<string, unknown>
    const lat = Number(p.lat)
    const lon = Number(p.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('tappa non valida')
    return {
      id: typeof p.id === 'string' ? p.id : String(i),
      name: typeof p.name === 'string' ? p.name : '',
      lat, lon,
      placeId: typeof p.placeId === 'string' ? p.placeId : undefined,
      includePoi: p.includePoi === true,
    }
  })
  // Default true (vedi PersonalizeItineraryPanel.tsx): i percorsi già noti/riconosciuti sono
  // considerati sicuri — l'utente deve disattivarli esplicitamente, non il contrario.
  const considerExistingTrails = body.considerExistingTrails !== false
  return { stops, considerExistingTrails }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/multi-stop/step/network] Errore imprevisto:', e)
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let params: { stops: MultiStopInput[]; considerExistingTrails: boolean }
  try {
    params = parseBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  const outcome = await prepareMultiStopNetworkStep(params.stops, params.considerExistingTrails)
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error, message: outcome.message }, { status: outcome.status })
  }

  const { bbox, fullStops, knownTrailWayIds } = outcome.prep
  return NextResponse.json({ bbox, fullStops, knownTrailWayIds })
}
