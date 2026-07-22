import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { resolvePlaceName, interpretSearchRequest, type ResolvedPlace, type InterpretedPreferences } from '@/lib/routeBuilder/resolvePlace'
import {
  searchHikingRoutesByName, queryHikingRelationsInBbox, resolveAreaBbox, padBbox,
  type HikingRouteCandidate,
} from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import type { TrackPoint } from '@/lib/tcxParser'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Stesso raggio del fallback "sentieri nei dintorni" di app/api/route-search-plain/route.ts.
const NEARBY_RADIUS_KM = 12
// Quanti candidati "trovati" (non-AI o dal Livello 1) risolvere subito con una traccia reale — un
// cap esplicito per limitare il costo Overpass/DTM aggiuntivo introdotto dalla risoluzione eager
// (vedi §2 del piano): solo quelli che risolvono sopravvivono come 'found', mai una card senza
// traccia.
const MAX_EAGER_RESOLVE = 3
// Quanti luoghi suggeriti dal Livello 1 (interpretazione AI) vengono ripassati al Livello 0 —
// una richiesta vaga può ammettere più interpretazioni valide, ma senza un tetto il costo
// Overpass/DTM per una singola ricerca crescerebbe senza controllo.
const MAX_INTERPRETED_PLACES = 3

export interface FoundRouteResult {
  id: number
  name: string
  hasName: boolean
  ref: string | undefined
  network: string | undefined
  routePolyline: [number, number][]
  trackPoints: TrackPoint[]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
}

// Stessa convenzione "nome, area" di lib/routeBuilder/resolvePlace.ts's resolvePlaceName — l'ultimo
// segmento dopo una virgola è un'area che restringe la ricerca, il resto è il nome/la zona.
function splitQuery(query: string): { nameQuery: string; areaHint: string | null } {
  const parts = query.split(',').map(p => p.trim()).filter(Boolean)
  const areaHint = parts.length >= 2 ? parts[parts.length - 1] : null
  const nameQuery = parts.length >= 2 ? parts.slice(0, -1).join(' ') : query.trim()
  return { nameQuery, areaHint }
}

// Stessa logica di app/api/route-search-plain/route.ts ("Cerca senza AI"), non spostata — solo
// riusata come funzioni di lib/overpassTrails.ts, per non duplicarne l'implementazione ma senza
// dover toccare quell'endpoint/quella card, che restano indipendenti.
async function findExistingRoutesNonAi(nameQuery: string, areaHint: string | null): Promise<HikingRouteCandidate[]> {
  const areaBbox = areaHint ? await resolveAreaBbox(areaHint) : null
  let candidates = await searchHikingRoutesByName(nameQuery, areaBbox, 8)
  if (candidates.length === 0) {
    const nearbyBbox = areaBbox ?? await resolveAreaBbox(nameQuery)
    if (nearbyBbox) {
      const [minLat, minLon, maxLat, maxLon] = padBbox(nearbyBbox, NEARBY_RADIUS_KM)
      candidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 12)
    }
  }
  return candidates
}

async function resolveFoundRoutes(candidates: HikingRouteCandidate[], cap: number): Promise<FoundRouteResult[]> {
  const resolved = await Promise.all(candidates.slice(0, cap).map(async c => {
    const track = await resolveTrackForCandidate({ osmId: c.id, gpxUrl: null })
    if (!track.ok) return null
    return {
      id: c.id, name: c.name, hasName: c.hasName, ref: c.ref, network: c.network,
      routePolyline: track.routePolyline, trackPoints: track.trackPoints,
      distanceMeters: track.distanceMeters, elevationGain: track.elevationGain,
      elevationLoss: track.elevationLoss, altitudeMax: track.altitudeMax, altitudeMin: track.altitudeMin,
      estimatedTimeSeconds: track.estimatedTimeSeconds, hasElevation: track.hasElevation,
    }
  }))
  return resolved.filter((r): r is FoundRouteResult => r != null)
}

// Livello 0: sempre, gratuito — risoluzione del luogo (non-AI, solo Nominatim/Overpass) in
// parallelo con la ricerca di percorsi esistenti (non-AI, Overpass). Chiamato sia per la query
// originale sia, dal Livello 1, per ciascun luogo interpretato dall'AI — mai con un parametro `ai`,
// per non richiamare ricorsivamente l'AI su un risultato AI.
async function tier0(query: string): Promise<{ place: ResolvedPlace | null; foundRoutes: FoundRouteResult[] }> {
  const { nameQuery, areaHint } = splitQuery(query)
  const [place, rawCandidates] = await Promise.all([
    resolvePlaceName(query),
    findExistingRoutesNonAi(nameQuery, areaHint),
  ])
  const foundRoutes = await resolveFoundRoutes(rawCandidates, MAX_EAGER_RESOLVE)
  return { place, foundRoutes }
}

// Ricerca a livelli per il wizard "Costruisci o trova un percorso" (components/upload/RouteBuilder.tsx):
// Livello 0 (sempre, gratuito) → Livello 1 (solo se il Livello 0 non trova nulla, e solo con AI
// attiva + chiave personale) → altrimenti `escalateToAi` segnala al client di aprire la chat
// completa di Giulia (Livello 2, /api/route-search, non gestito qui perché conversazionale).
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

  let query: string
  let useAi: boolean
  try {
    const body = await req.json()
    if (typeof body.query !== 'string' || !body.query.trim()) throw new Error('query mancante')
    query = body.query.trim().slice(0, 300)
    useAi = body.useAi === true
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  let place: ResolvedPlace | null = null
  let foundRoutes: FoundRouteResult[] = []
  let prefill: InterpretedPreferences | null = null

  try {
    const level0 = await tier0(query)
    place = level0.place
    foundRoutes = level0.foundRoutes
  } catch (e) {
    console.error('[route-build/search] Livello 0 fallito:', e)
  }

  // Livello 1: solo se il Livello 0 non ha trovato assolutamente nulla, e solo con l'AI attiva e
  // una chiave personale disponibile — mai la chiave condivisa di emergenza (stessa scelta già
  // fatta per il livello AI di resolvePlaceName).
  if (!place && foundRoutes.length === 0 && useAi && user) {
    try {
      const { apiKey, claudeModel } = await resolveApiKeyAndSettings(user.id, 'routeBuildInterpretRequest')
      if (apiKey) {
        const interpreted = await interpretSearchRequest(query, apiKey, claudeModel)
        if (interpreted) {
          prefill = interpreted.prefs
          for (const p of interpreted.places.slice(0, MAX_INTERPRETED_PLACES)) {
            const rerun = await tier0(p.query)
            if (!place && rerun.place) place = rerun.place
            if (rerun.foundRoutes.length > 0) {
              foundRoutes = [...foundRoutes, ...rerun.foundRoutes].slice(0, MAX_EAGER_RESOLVE)
            }
          }
        }
      }
    } catch (e) {
      console.error('[route-build/search] Livello 1 (interpretazione AI) fallito:', e)
    }
  }

  // Nessun risultato da nessuno dei due livelli gratuiti/economici — se l'AI è attiva, il client
  // apre la chat completa di Giulia (Livello 2, ricerca web) come ultima risorsa.
  const escalateToAi = useAi && !place && foundRoutes.length === 0

  return NextResponse.json({ place, prefill, foundRoutes, escalateToAi })
}
