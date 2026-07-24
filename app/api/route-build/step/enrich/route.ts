// Step 3/3 della pipeline "Su misura" a step (vedi app/api/route-build/step/network/route.ts per
// il perché della suddivisione): arricchisce i candidati grezzi (solo geometria, dallo step
// precedente) con quota stimata e POI lungo il tracciato, poi li ordina — stesso identico motore
// (scoreAndEnrichCandidates) usato dalla pipeline monolitica, isolato in una richiesta a parte con
// un proprio tetto di 60s invece di sommarsi al fetch rete e al pathfinding.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { scoreAndEnrichCandidates } from '@/lib/routeBuilder/scoreCandidates'
import { sanitizeHikerConcerns, sanitizeHikerEnvironmentPrefs } from '@/lib/hikerProfile'
import { POI_META, type PoiType } from '@/lib/overpass'
import type { RouteCandidate } from '@/lib/routeBuilder/loopBuilder'
import { ENRICH_CAP } from '@/lib/routeBuilder/buildConstants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_POI_TYPES = new Set(Object.keys(POI_META))
const VALID_ROUTE_TYPES = new Set(['anello', 'andata_ritorno', 'solo_andata'])

interface EnrichRequestBody {
  rawCandidates: RouteCandidate[]
  targetDistanceM: number
  targetElevationM: number | null
  environmentPrefs: ReturnType<typeof sanitizeHikerEnvironmentPrefs>
  concerns: ReturnType<typeof sanitizeHikerConcerns>
  desiredPoiTypes: PoiType[]
  bbox: [number, number, number, number]
}

function parseCandidate(raw: unknown): RouteCandidate | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (!VALID_ROUTE_TYPES.has(c.type as string)) return null
  if (!Array.isArray(c.polyline)) return null
  const distanceM = Number(c.distanceM)
  const bearingDeg = Number(c.bearingDeg)
  if (!Number.isFinite(distanceM) || !Number.isFinite(bearingDeg)) return null
  return { type: c.type as RouteCandidate['type'], polyline: c.polyline as [number, number][], distanceM, bearingDeg }
}

function parseBody(raw: unknown): EnrichRequestBody {
  if (!raw || typeof raw !== 'object') throw new Error('Richiesta non valida')
  const body = raw as Record<string, unknown>
  if (!Array.isArray(body.rawCandidates)) throw new Error('rawCandidates non valido')
  const rawCandidates = body.rawCandidates.map(parseCandidate).filter((c): c is RouteCandidate => c != null)

  const targetDistanceM = Number(body.targetDistanceM)
  if (!Number.isFinite(targetDistanceM) || targetDistanceM <= 0) throw new Error('targetDistanceM non valido')
  const targetElevationRaw = Number(body.targetElevationM)
  const targetElevationM = body.targetElevationM != null && Number.isFinite(targetElevationRaw) ? targetElevationRaw : null

  const environmentPrefs = sanitizeHikerEnvironmentPrefs(Array.isArray(body.environmentPrefs) ? body.environmentPrefs : [])
  const concerns = sanitizeHikerConcerns(Array.isArray(body.concerns) ? body.concerns : [])
  const desiredPoiTypes = Array.isArray(body.desiredPoiTypes)
    ? body.desiredPoiTypes.filter((t): t is PoiType => typeof t === 'string' && VALID_POI_TYPES.has(t))
    : []

  const bbox = body.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Bbox non valido')
  }

  return { rawCandidates, targetDistanceM, targetElevationM, environmentPrefs, concerns, desiredPoiTypes, bbox: bbox as [number, number, number, number] }
}

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req)
  } catch (e) {
    console.error('[route-build/step/enrich] Errore imprevisto:', e)
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

  let params: EnrichRequestBody
  try {
    params = parseBody(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Richiesta non valida' }, { status: 400 })
  }

  try {
    const candidates = await scoreAndEnrichCandidates(params.rawCandidates.slice(0, ENRICH_CAP), {
      targetDistanceM: params.targetDistanceM,
      targetElevationM: params.targetElevationM,
      environmentPrefs: params.environmentPrefs,
      concerns: params.concerns,
      desiredPoiTypes: params.desiredPoiTypes,
      bbox: params.bbox,
    })
    return NextResponse.json({ candidates })
  } catch (e) {
    console.error('[route-build/step/enrich] scoreAndEnrichCandidates failed:', e)
    return NextResponse.json({ error: 'Arricchimento dei percorsi non riuscito, riprova.' }, { status: 502 })
  }
}
