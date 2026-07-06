import { computeSafetyScore, type SafetyScore, type WildlifeRisk } from './safetyScore'
import { fetchWildlifeRiskFromGbif } from './wildlifeRiskFromGbif'
import { computeBbox } from './geoUtils'
import { updatePlannedMeta, type PlannedHike } from './plannedStore'

/**
 * Runs the Safety Score pipeline (wildlife/guardian-dog risk lookup + computeSafetyScore) for a
 * planned hike and persists the result. Self-contained like computeCtsForHike, so it can run
 * fire-and-forget right after a hike is added, not just when the hike happens to be open.
 */
export async function computeSafetyForHike(hike: Pick<PlannedHike,
  'id' | 'routePolyline' | 'distanceMeters' | 'elevationGain' | 'elevationLoss' | 'altitudeMax' | 'altitudeMin' | 'estimatedTimeSeconds' | 'plannedDate'
>): Promise<SafetyScore> {
  const poly = hike.routePolyline
  let gbifWildlifeRisks: WildlifeRisk[] = []
  let guardianDogRisk: { present: boolean } | undefined
  if (poly && poly.length >= 2) {
    const bbox = computeBbox(poly, 0.005)
    const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number)
    const animalsBbox = `${minLat},${maxLat},${minLon},${maxLon}`
    const month = hike.plannedDate ? new Date(hike.plannedDate).getMonth() + 1 : new Date().getMonth() + 1
    const [gbifResult, guardianResult] = await Promise.allSettled([
      fetchWildlifeRiskFromGbif(animalsBbox, month),
      fetch(`/api/trails/guardian-dogs?bbox=${encodeURIComponent(bbox)}`, { signal: AbortSignal.timeout(20000) })
        .then(r => r.json()) as Promise<{ present: boolean }>,
    ])
    if (gbifResult.status === 'fulfilled') gbifWildlifeRisks = gbifResult.value
    if (guardianResult.status === 'fulfilled') guardianDogRisk = guardianResult.value
  }

  const safety = computeSafetyScore({
    distanceMeters: hike.distanceMeters, elevationGain: hike.elevationGain,
    elevationLoss: hike.elevationLoss, altitudeMax: hike.altitudeMax, altitudeMin: hike.altitudeMin,
    estimatedTimeSeconds: hike.estimatedTimeSeconds, routePolyline: hike.routePolyline,
    plannedDate: hike.plannedDate, gbifWildlifeRisks, guardianDogRisk,
  })
  await updatePlannedMeta(hike.id, { cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() })
  return safety
}
