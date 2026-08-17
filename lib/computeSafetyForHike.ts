import { computeSafetyScore, refineSafetyWithTerrainSignals, type SafetyScore, type WildlifeRisk } from './safetyScore'
import { fetchWildlifeRiskFromGbif } from './wildlifeRiskFromGbif'
import { fetchTerrainContext } from './overpass'
import { computeBbox } from './geoUtils'
import { updatePlannedMeta, type PlannedHike } from './plannedStore'
import { refreshTsForHike } from './computeTsForHike'
import { effectiveHikeMetrics } from './routeMode'

export interface SafetyCoreInput {
  routePolyline?: PlannedHike['routePolyline']
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  plannedDate?: string
  /** Picco di pendenza reale già cachato sulla hike (PlannedHike.dtmProfile, calcolato da
   * app/guida/useDtmProfile.ts quando la Guida viene aperta) — MAI fetchato qui: il servizio DTM
   * esterno è rate-limited (50 chiamate/24h), quindi questo campo resta `undefined` finché la
   * Guida non è stata aperta almeno una volta. Degrado grazioso, non un errore. */
  maxSlopeDeg?: number
}

/**
 * Runs the Safety Score pipeline (wildlife/guardian-dog risk lookup + computeSafetyScore) for a
 * hike and returns the result WITHOUT persisting it — shared by computeSafetyForHike (planned
 * hikes, persists via updatePlannedMeta) and any caller that needs a preview before a hike exists
 * (e.g. components/upload/RouteBuilder.tsx scoring not-yet-saved route candidates), mirroring the
 * computeCtsCore/computeCtsForHike split in lib/computeCtsForHike.ts.
 */
export async function computeSafetyCore(hike: SafetyCoreInput): Promise<SafetyScore> {
  const poly = hike.routePolyline
  let gbifWildlifeRisks: WildlifeRisk[] = []
  let guardianDogRisk: { present: boolean } | undefined
  let sacScale: string | undefined
  if (poly && poly.length >= 2) {
    const bbox = computeBbox(poly, 0.005)
    const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
    const animalsBbox = `${minLat},${maxLat},${minLon},${maxLon}`
    const month = hike.plannedDate ? new Date(hike.plannedDate).getMonth() + 1 : new Date().getMonth() + 1
    const [gbifResult, guardianResult, terrainResult] = await Promise.allSettled([
      fetchWildlifeRiskFromGbif(animalsBbox, month),
      fetch(`/api/trails/guardian-dogs?bbox=${encodeURIComponent(bbox)}`, { signal: AbortSignal.timeout(20000) })
        .then(r => r.json()) as Promise<{ present: boolean }>,
      // Scala SAC reale (T1-T6) via Overpass — non rate-limited come il DTM, quindi fetchata
      // liberamente qui ad ogni calcolo, stesso trattamento best-effort di fauna/cani.
      fetchTerrainContext(poly),
    ])
    if (gbifResult.status === 'fulfilled') gbifWildlifeRisks = gbifResult.value
    if (guardianResult.status === 'fulfilled') guardianDogRisk = guardianResult.value
    if (terrainResult.status === 'fulfilled') sacScale = terrainResult.value.sacScale
  }

  const safety = computeSafetyScore({
    distanceMeters: hike.distanceMeters, elevationGain: hike.elevationGain,
    elevationLoss: hike.elevationLoss, altitudeMax: hike.altitudeMax, altitudeMin: hike.altitudeMin,
    estimatedTimeSeconds: hike.estimatedTimeSeconds, routePolyline: hike.routePolyline,
    plannedDate: hike.plannedDate, gbifWildlifeRisks, guardianDogRisk,
  })
  return refineSafetyWithTerrainSignals(safety, { maxSlopeDeg: hike.maxSlopeDeg, sacScale })
}

/**
 * Runs computeSafetyCore for a planned hike and persists the result, then triggers a Trail Score
 * v2 recompute (see lib/computeTsForHike.ts) so the aggregate never lags behind its own Sicurezza
 * input. Self-contained like computeCtsForHike, so it can run fire-and-forget right after a hike
 * is added, not just when the hike happens to be open.
 */
export async function computeSafetyForHike(hike: Pick<PlannedHike,
  'id' | 'routePolyline' | 'distanceMeters' | 'elevationGain' | 'elevationLoss' | 'altitudeMax' | 'altitudeMin' | 'estimatedTimeSeconds' | 'plannedDate' | 'routeMode' | 'dtmProfile'
>): Promise<SafetyScore> {
  // Un andata e ritorno dichiarato è il doppio della fatica e del tempo sotto il sole: la
  // Sicurezza si calcola sulle cifre effettive (lib/routeMode.ts), non sulla sola andata.
  const safety = await computeSafetyCore({
    ...hike, ...effectiveHikeMetrics(hike, hike.routeMode),
    // undefined se la Guida non è ancora mai stata aperta per questa hike — computeSafetyCore
    // degrada correttamente (nessuna fetch DTM qui, vedi commento su SafetyCoreInput.maxSlopeDeg).
    maxSlopeDeg: hike.dtmProfile?.maxSlopeDeg ?? undefined,
  })
  await updatePlannedMeta(hike.id, { cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() })
  refreshTsForHike(hike.id).catch(() => {})
  return safety
}
