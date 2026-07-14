import { computeTrailScoreV2 } from './trailScoreV2'
import { getPlannedById, updatePlannedMeta } from './plannedStore'

/**
 * Recomputes and persists the Trail Score v2 aggregate (cachedTsTotal) for a planned hike,
 * reading whatever CTS/Sicurezza are currently cached for it — cache-first via getPlannedById,
 * so this is near-instant right after a sibling score's own updatePlannedMeta call already wrote
 * its patch to the local cache.
 *
 * Called from the end of computeCtsForHike and computeSafetyForHike (and their batch-recompute
 * counterparts in lib/recalcScores.ts) so the aggregate is (re)materialized as soon as both of
 * its inputs land — at import time, on a later "reopen the hike" refresh, or after a manual
 * recalc from Impostazioni — instead of only once, client-side, the first time someone opens the
 * guide page.
 */
export async function refreshTsForHike(hikeId: string): Promise<number | null> {
  const hike = await getPlannedById(hikeId)
  if (!hike) return null

  const cts = hike.cachedTrailScore ?? null
  const safety = hike.cachedSafetyScore?.overall ?? null

  const result = computeTrailScoreV2({ cts, safety })
  if (!result) return null
  if (hike.cachedTsTotal === result.score) return result.score

  await updatePlannedMeta(hikeId, { cachedTsTotal: result.score })
  return result.score
}
