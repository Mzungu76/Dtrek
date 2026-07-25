// Logica condivisa tra la ricerca "Esistenti" monolitica (app/api/route-build/search/route.ts,
// mantenuta come endpoint per compatibilità) e i due endpoint a step
// (app/api/route-build/step/search-find e step/search-resolve) — stessa identica logica in
// entrambi i casi, solo richiamabile sia in un'unica richiesta sia spezzata in due chiamate HTTP
// brevi (trovare candidati vs risolvere le tracce reali, la parte più pesante e variabile), ciascuna
// col proprio tetto di 60s — stesso principio già applicato a "Su misura" (vedi buildSteps.ts).
//
// SERVER-ONLY: resolveApiKeyAndSettings/resolvePlaceName toccano Supabase — non importare da un
// componente client.
import { resolvePlaceName, interpretSearchRequest, type ResolvedPlace, type InterpretedPreferences } from '@/lib/routeBuilder/resolvePlace'
import {
  searchHikingRoutesByName, queryHikingRelationsInBbox, resolveAreaBbox, padBbox, looksLikePlaceName,
  sortByDistanceFrom, type HikingRouteCandidate,
} from '@/lib/overpassTrails'
import { resolveTrackForCandidate } from '@/lib/routeBuilder/resolveTrack'
import { resolveApiKeyAndSettings } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { fetchPoisNearPolyline } from '@/lib/routeBuilder/nearbyPois'
import { computeProvisionalScore } from '@/lib/routeBuilder/provisionalScore'
import type { TrackPoint } from '@/lib/tcxParser'
import { DEFAULT_RADIUS_KM, ALLOWED_RADIUS_KM } from '@/lib/routeBuilder/buildConstants'

// Quanti candidati "trovati" risolvere subito con una traccia reale — i candidati arrivano già
// ordinati dal più vicino al più lontano (vedi findTier0), quindi il cap si traduce in risultati
// realmente vicini, non casuali.
export const MAX_EAGER_RESOLVE = 8
// Quanti luoghi suggeriti dal Livello 1 (interpretazione AI) vengono ripassati al Livello 0 — una
// richiesta vaga può ammettere più interpretazioni valide, ma senza un tetto il costo Overpass per
// una singola ricerca crescerebbe senza controllo.
const MAX_INTERPRETED_PLACES = 3

export function sanitizeSearchRadiusKm(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_RADIUS_KM
  return ALLOWED_RADIUS_KM.reduce((best, v) => Math.abs(v - n) < Math.abs(best - n) ? v : best)
}

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
  pois: import('@/lib/overpass').PoiItem[]
  provisionalScore: import('@/lib/routeBuilder/provisionalScore').ProvisionalScore
}

// Stessa convenzione "nome, area" di lib/routeBuilder/resolvePlace.ts's resolvePlaceName — vedi
// commento esteso nella versione precedente (git log di app/api/route-build/search/route.ts) per il
// perché del taglio a ESATTAMENTE 2 parti (un indirizzo completo alla Nominatim ne ha 5).
function splitQuery(query: string): { nameQuery: string; areaHint: string | null } {
  const parts = query.split(',').map(p => p.trim()).filter(Boolean)
  const areaHint = parts.length === 2 ? parts[1] : null
  const nameQuery = parts.length === 2 ? parts[0] : query.trim()
  return { nameQuery, areaHint }
}

async function findExistingRoutesNonAi(nameQuery: string, areaHint: string | null, radiusKm: number): Promise<HikingRouteCandidate[]> {
  const areaBbox = areaHint ? await resolveAreaBbox(areaHint) : null
  if (!areaBbox && !looksLikePlaceName(nameQuery)) return []

  let candidates = await searchHikingRoutesByName(nameQuery, areaBbox, 12)
  if (candidates.length === 0) {
    const nearbyBbox = areaBbox ?? await resolveAreaBbox(nameQuery)
    if (nearbyBbox) {
      const [minLat, minLon, maxLat, maxLon] = padBbox(nearbyBbox, radiusKm)
      candidates = await queryHikingRelationsInBbox(minLat, minLon, maxLat, maxLon, 20)
    }
  }
  return candidates
}

// Livello 0: sempre, gratuito — risoluzione del luogo (non-AI, solo Nominatim/Overpass) in
// parallelo con la ricerca di percorsi esistenti (non-AI, Overpass) — SENZA risolvere le tracce
// (quello è il passo successivo, resolveFoundRoutesWithPoi, deliberatamente separato).
async function findTier0(query: string, radiusKm: number): Promise<{ place: ResolvedPlace | null; candidates: HikingRouteCandidate[] }> {
  const { nameQuery, areaHint } = splitQuery(query)
  const [place, rawCandidates] = await Promise.all([
    resolvePlaceName(query),
    findExistingRoutesNonAi(nameQuery, areaHint, radiusKm),
  ])
  const candidates = place ? sortByDistanceFrom(rawCandidates, place.lat, place.lon) : rawCandidates
  return { place, candidates }
}

export interface FindResult {
  place: ResolvedPlace | null
  candidates: HikingRouteCandidate[]
  prefill: InterpretedPreferences | null
  tierReached: 'tier0' | 'tier1'
  escalateToAi: boolean
  interpretedPlacesCount: number
}

/**
 * Livello 0 (sempre, gratuito) → Livello 1 (solo se il Livello 0 non trova nulla, e solo con AI
 * attiva + chiave personale) — NON risolve tracce reali (quello è resolveFoundRoutesWithPoi,
 * chiamata a parte). Usata sia dalla pipeline monolitica (app/api/route-build/search/route.ts)
 * sia da app/api/route-build/step/search-find/route.ts.
 */
export async function findExistingRoutesForQuery(
  user: { id: string } | null, query: string, radiusKm: number, useAi: boolean,
): Promise<FindResult> {
  let place: ResolvedPlace | null = null
  let candidates: HikingRouteCandidate[] = []
  let prefill: InterpretedPreferences | null = null
  let tierReached: 'tier0' | 'tier1' = 'tier0'
  let interpretedPlacesCount = 0

  try {
    const level0 = await findTier0(query, radiusKm)
    place = level0.place
    candidates = level0.candidates
  } catch (e) {
    console.error('[searchSteps] Livello 0 fallito:', e)
  }

  if (!place && candidates.length === 0 && useAi && user) {
    tierReached = 'tier1'
    try {
      const { apiKey, claudeModel } = await resolveApiKeyAndSettings(user.id, 'routeBuildInterpretRequest')
      if (apiKey) {
        const interpreted = await interpretSearchRequest(query, apiKey, claudeModel)
        if (interpreted) {
          prefill = interpreted.prefs
          interpretedPlacesCount = interpreted.places.length
          for (const p of interpreted.places.slice(0, MAX_INTERPRETED_PLACES)) {
            const rerun = await findTier0(p.query, radiusKm)
            if (!place && rerun.place) place = rerun.place
            if (rerun.candidates.length > 0) candidates = [...candidates, ...rerun.candidates]
          }
        }
      }
    } catch (e) {
      console.error('[searchSteps] Livello 1 (interpretazione AI) fallito:', e)
    }
  }

  const escalateToAi = useAi && !place && candidates.length === 0

  return { place, candidates, prefill, tierReached, escalateToAi, interpretedPlacesCount }
}

/**
 * Risolve fino a `cap` candidati con una traccia reale, POI vicini (lib/routeBuilder/nearbyPois.ts)
 * e una stima provvisoria di Sicurezza/Trail Score (lib/routeBuilder/provisionalScore.ts) — la
 * parte più pesante e variabile della ricerca "Esistenti" (fino a `cap` risoluzioni Overpass in
 * parallelo), isolata in un passo a parte per lo stesso motivo del pathfinding di "Su misura".
 */
export async function resolveFoundRoutesWithPoi(candidates: HikingRouteCandidate[], cap: number): Promise<FoundRouteResult[]> {
  const resolved = await Promise.all(candidates.slice(0, cap).map(async c => {
    const track = await resolveTrackForCandidate({ osmId: c.id, gpxUrl: null })
    if (!track.ok) return null
    const pois = await fetchPoisNearPolyline(track.routePolyline).catch(() => [])
    const provisionalScore = computeProvisionalScore({
      routePolyline: track.routePolyline, trackPoints: track.trackPoints, distanceMeters: track.distanceMeters,
      elevationGain: track.elevationGain, elevationLoss: track.elevationLoss, altitudeMax: track.altitudeMax,
      altitudeMin: track.altitudeMin, estimatedTimeSeconds: track.estimatedTimeSeconds, pois,
    })
    return {
      id: c.id, name: c.name, hasName: c.hasName, ref: c.ref, network: c.network,
      routePolyline: track.routePolyline, trackPoints: track.trackPoints,
      distanceMeters: track.distanceMeters, elevationGain: track.elevationGain,
      elevationLoss: track.elevationLoss, altitudeMax: track.altitudeMax, altitudeMin: track.altitudeMin,
      estimatedTimeSeconds: track.estimatedTimeSeconds, hasElevation: track.hasElevation,
      pois, provisionalScore,
    }
  }))
  return resolved.filter((r): r is FoundRouteResult => r != null)
}
