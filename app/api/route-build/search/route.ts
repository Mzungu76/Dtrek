import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { resolvePlaceName, interpretSearchRequest, type ResolvedPlace, type InterpretedPreferences } from '@/lib/routeBuilder/resolvePlace'
import {
  searchHikingRoutesByName, queryHikingRelationsInBbox, resolveAreaBbox, padBbox, looksLikePlaceName,
  sortByDistanceFrom, type HikingRouteCandidate,
} from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import { logRouteBuildEvent } from '@/lib/routeBuilder/operationsLog'
import type { TrackPoint } from '@/lib/tcxParser'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Raggio di ricerca "sentieri nei dintorni" attorno al luogo/punto risolto — alzato da 12 a 20 km
// (richiesta esplicita) rispetto al fallback storico di app/api/route-search-plain/route.ts, che
// resta invariato a 12.
const NEARBY_RADIUS_KM = 20
// Quanti candidati "trovati" (non-AI o dal Livello 1) risolvere subito con una traccia reale — un
// cap esplicito per limitare il costo Overpass/DTM aggiuntivo introdotto dalla risoluzione eager
// (vedi §2 del piano): solo quelli che risolvono sopravvivono come 'found', mai una card senza
// traccia. Alzato da 3 a 8 — i candidati arrivano già ordinati dal più vicino al più lontano
// (vedi tier0), quindi il cap più alto si traduce in più risultati realmente vicini, non in
// risultati casuali lontani.
const MAX_EAGER_RESOLVE = 8
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
// dover toccare quell'endpoint/quella card, che restano indipendenti. Senza un'area a restringere
// il bbox, una query Overpass per nome su tutta Italia ha senso solo se il testo è un plausibile
// nome di percorso (vedi looksLikePlaceName) — una frase libera lunga (com'è tipico ora che questo
// endpoint riceve anche descrizioni discorsive dal wizard di ricerca unificato) farebbe girare lo
// stesso tipo di regex nazionale pesante che ha già causato dei 504 in passato, per nulla.
async function findExistingRoutesNonAi(nameQuery: string, areaHint: string | null): Promise<HikingRouteCandidate[]> {
  const areaBbox = areaHint ? await resolveAreaBbox(areaHint) : null
  if (!areaBbox && !looksLikePlaceName(nameQuery)) return []

  let candidates = await searchHikingRoutesByName(nameQuery, areaBbox, 12)
  if (candidates.length === 0) {
    const nearbyBbox = areaBbox ?? await resolveAreaBbox(nameQuery)
    if (nearbyBbox) {
      const [minLat, minLon, maxLat, maxLon] = padBbox(nearbyBbox, NEARBY_RADIUS_KM)
      candidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 20)
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
  // Dal più vicino al più lontano rispetto al luogo risolto — sia per mostrarli in quell'ordine,
  // sia perché MAX_EAGER_RESOLVE risolve solo i primi: meglio che siano i più vicini, non i primi
  // arrivati da Overpass in un ordine arbitrario.
  const orderedCandidates = place ? sortByDistanceFrom(rawCandidates, place.lat, place.lon) : rawCandidates
  const foundRoutes = await resolveFoundRoutes(orderedCandidates, MAX_EAGER_RESOLVE)
  return { place, foundRoutes }
}

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
  try {
    const body = await req.json()
    if (typeof body.query !== 'string' || !body.query.trim()) throw new Error('query mancante')
    query = body.query.trim().slice(0, 300)
    useAi = body.useAi === true
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  const startedAt = Date.now()
  let place: ResolvedPlace | null = null
  let foundRoutes: FoundRouteResult[] = []
  let prefill: InterpretedPreferences | null = null
  let tierReached: 'tier0' | 'tier1' = 'tier0'
  let interpretedPlacesCount = 0

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
    tierReached = 'tier1'
    try {
      const { apiKey, claudeModel } = await resolveApiKeyAndSettings(user.id, 'routeBuildInterpretRequest')
      if (apiKey) {
        const interpreted = await interpretSearchRequest(query, apiKey, claudeModel)
        if (interpreted) {
          prefill = interpreted.prefs
          interpretedPlacesCount = interpreted.places.length
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

  await logRouteBuildEvent({
    userId: user?.id ?? null,
    kind: 'search',
    query,
    useAi,
    tierReached: escalateToAi ? `${tierReached}_escalated` : tierReached,
    placeName: place?.displayName ?? null,
    foundCount: foundRoutes.length,
    escalatedToAi: escalateToAi,
    durationMs: Date.now() - startedAt,
    details: { interpretedPlacesCount },
  })

  return NextResponse.json({ place, prefill, foundRoutes, escalateToAi })
}
