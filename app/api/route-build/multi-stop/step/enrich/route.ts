// Step 3/3 della pipeline multi-tappa: arricchisce il percorso grezzo (solo geometria, dallo step
// precedente) con quota stimata e POI lungo il tracciato — stesso motore (scoreAndEnrichCandidates)
// usato dalla Modalità A, isolato in una richiesta a parte con un proprio tetto di 60s. Vedi
// lib/routeBuilder/multiStopSteps.ts per il perché della suddivisione.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { scoreAndEnrichCandidates } from '@/lib/routeBuilder/scoreCandidates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface EnrichRequestBody {
  routePolyline: [number, number][]
  distanceM: number
  targetDistanceKm: number | null
  bbox: [number, number, number, number]
}

function parseBody(raw: unknown): EnrichRequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  if (!Array.isArray(body.routePolyline)) throw new Error('routePolyline non valido')
  const distanceM = Number(body.distanceM)
  if (!Number.isFinite(distanceM) || distanceM < 0) throw new Error('distanceM non valido')
  const distRaw = Number(body.targetDistanceKm)
  const targetDistanceKm = body.targetDistanceKm != null && Number.isFinite(distRaw) ? distRaw : null
  const bbox = body.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Bbox non valido')
  }
  return { routePolyline: body.routePolyline as [number, number][], distanceM, targetDistanceKm, bbox: bbox as [number, number, number, number] }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/multi-stop/step/enrich] Errore imprevisto:', e)
    return NextResponse.json(
      { error: 'Errore interno', message: 'Generazione non riuscita per un errore interno, riprova.' },
      { status: 500 },
    )
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  const user = await getUserFromRequest(req)
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let params: EnrichRequestBody
  try {
    params = parseBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  // Un'unica candidata sintetica attraverso lo scorer esistente — solo per la stima di
  // quota/tempo/POI dell'anteprima (nessun ranking: non esiste un'alternativa da confrontare).
  const [scored] = await scoreAndEnrichCandidates(
    [{ type: 'solo_andata', polyline: params.routePolyline, distanceM: params.distanceM, bearingDeg: 0, hasSteps: false, hazardMarkers: [] }],
    {
      targetDistanceM: (params.targetDistanceKm ?? params.distanceM / 1000) * 1000,
      // Nessun input dislivello qui (vedi PersonalizeItineraryPanel.tsx) — l'algoritmo non ha
      // alcuna leva per orientare il cammino verso un dislivello target con tappe fisse, un campo
      // che non può mai influenzare il risultato sarebbe stato solo un'opzione fittizia.
      targetElevationM: null,
      environmentPrefs: [],
      concerns: [],
      desiredPoiTypes: [],
      bbox: params.bbox,
    },
    1,
  )

  // scoreAndEnrichCandidates scarta solo un candidato con polyline < 2 punti (due tappe scelte
  // così vicine da agganciarsi allo stesso nodo della rete) — un caso raro ma non impossibile, da
  // non far crashare: si risponde comunque con i dati grezzi già calcolati (nessuna stima
  // quota/POI, coerente con "mai inventare un dato" — meglio assente che falso).
  if (!scored) {
    return NextResponse.json({
      routePolyline: params.routePolyline,
      trackPoints: [],
      distanceMeters: params.distanceM,
      elevationGain: 0,
      elevationLoss: 0,
      altitudeMax: 0,
      altitudeMin: 0,
      estimatedTimeSeconds: Math.round(params.distanceM / 1.2),
      hasElevation: false,
      pois: [],
    })
  }

  return NextResponse.json({
    routePolyline: scored.routePolyline,
    trackPoints: scored.trackPoints,
    distanceMeters: scored.distanceMeters,
    elevationGain: scored.elevationGain,
    elevationLoss: scored.elevationLoss,
    altitudeMax: scored.altitudeMax,
    altitudeMin: scored.altitudeMin,
    estimatedTimeSeconds: scored.estimatedTimeSeconds,
    hasElevation: scored.hasElevation,
    pois: scored.pois,
  })
}
