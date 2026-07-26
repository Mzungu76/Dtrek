// Genera candidati "Esistenti" per zone dove le relation route= curate non bastano — trasforma
// l'analisi arco-per-arco di hikingProbability.ts in percorsi concreti (FoundRouteResult) pronti
// per la stessa pipeline di risultati della ricerca esistente. Usato da searchSteps.ts come
// RIPIEGO solo quando la ricerca per relation non trova nulla: una relation curata resta sempre
// la fonte primaria quando esiste, questo copre il caso motivante originale — zone poco mappate
// dove la rete camminabile esiste davvero ma non è mai stata assemblata in una relation.
import { computeHikingProbability, extractCandidateRoutes, type Bbox } from './hikingProbability'
import { estimateElevationForGeometry } from '@/lib/dtm/elevationEnrich'
import { computeProvisionalScore } from './provisionalScore'
import { fetchPoisNearPolyline } from './nearbyPois'
import type { FoundRouteResult } from './searchSteps'

// Id sintetico NEGATIVO — un vero id di relation OSM è sempre positivo, quindi non c'è mai
// collisione. Il chiamante lato client (components/upload/RouteBuilder.tsx) usa questo invariante
// per non scrivere questi percorsi come se avessero una relation OSM reale da poter ri-recuperare
// in futuro (osmId resta assente per loro, esattamente come un percorso importato da GPX).
function syntheticId(wayIds: number[]): number {
  return -(wayIds[0] ?? 1)
}

export async function findProbabilityRoutes(bbox: Bbox): Promise<FoundRouteResult[]> {
  const { edges, nodes } = await computeHikingProbability(bbox)
  const candidates = extractCandidateRoutes(edges, nodes)
  if (candidates.length === 0) return []

  const resolved = await Promise.all(candidates.map(async c => {
    // Stima geometrica, non DTM reale (stesso principio dei candidati "Su misura"/relation appena
    // trovati: la quota vera arriva solo quando l'utente sceglie/importa questo percorso specifico,
    // vedi enrichTrackWithRealElevation) — questi candidati sono già più costosi in Overpass degli
    // altri (l'intero motore di probabilità), non vale la pena sommarci anche una chiamata DTM per
    // ciascuno prima di sapere se l'utente lo aprirà mai.
    const estimated = estimateElevationForGeometry(c.polyline)
    const pois = await fetchPoisNearPolyline(c.polyline).catch(() => [])
    const provisionalScore = computeProvisionalScore({
      routePolyline: c.polyline,
      trackPoints: estimated.trackPoints,
      distanceMeters: estimated.distanceMeters,
      elevationGain: estimated.elevationGain,
      elevationLoss: estimated.elevationLoss,
      altitudeMax: estimated.altitudeMax,
      altitudeMin: estimated.altitudeMin,
      estimatedTimeSeconds: estimated.estimatedTimeSeconds,
      pois,
    })

    const result: FoundRouteResult = {
      id: syntheticId(c.wayIds),
      name: `Percorso rilevato (${(c.distanceMeters / 1000).toFixed(1)} km)`,
      hasName: false,
      ref: undefined,
      network: undefined,
      routePolyline: c.polyline,
      trackPoints: estimated.trackPoints,
      distanceMeters: estimated.distanceMeters,
      elevationGain: estimated.elevationGain,
      elevationLoss: estimated.elevationLoss,
      altitudeMax: estimated.altitudeMax,
      altitudeMin: estimated.altitudeMin,
      estimatedTimeSeconds: estimated.estimatedTimeSeconds,
      hasElevation: false,
      pois,
      provisionalScore,
    }
    return result
  }))

  return resolved
}
