import { computeTrailScoreV2 } from './trailScoreV2'
import { getPlannedById, updatePlannedMeta } from './plannedStore'

/**
 * Recomputes and persists the Trail Score v2 aggregate (cachedTsTotal) for a planned hike,
 * reading whatever CTS/Sicurezza/Ombra&Acqua are currently cached for it — cache-first via
 * getPlannedById, so this is near-instant right after a sibling score's own updatePlannedMeta
 * call already wrote its patch to the local cache.
 *
 * Called from the end of computeCtsForHike, computeSafetyForHike and the Ombra&Acqua background
 * trigger/refresh (and their batch-recompute counterparts in lib/recalcScores.ts) so the
 * aggregate is (re)materialized as soon as any of its inputs land — at import time, on a later
 * "reopen the hike" refresh, or after a manual recalc from Impostazioni — instead of only once,
 * client-side, the first time someone opens the guide page. Trail Score v2 no longer depends on
 * Affidabilità (see lib/trailScoreV2.ts), so it doesn't need to wait on CL like it used to: it's
 * ready as soon as CTS and Sicurezza are both cached (Ombra&Acqua refines it further if/when it
 * lands, via the same idempotent recompute).
 */
export async function refreshTsForHike(hikeId: string, forecastTempC?: number | null): Promise<number | null> {
  const hike = await getPlannedById(hikeId)
  if (!hike) return null

  const cts = hike.cachedTrailScore ?? null
  const safety = hike.cachedSafetyScore?.overall ?? null
  const ombraAcqua = hike.s2Available && hike.s2ShadeScore != null ? hike.s2ShadeScore * 100 : null

  const result = computeTrailScoreV2({ cts, safety, ombraAcqua, forecastTempC })
  if (!result) return null
  if (hike.cachedTsTotal === result.score) return result.score

  await updatePlannedMeta(hikeId, { cachedTsTotal: result.score })
  return result.score
}
