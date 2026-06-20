// Activity signal collector — DTrek usage-recency bonus from a spatially
// matched activity/planned hike (resolved once by computeSI.ts via
// findMatchingActivity and threaded in through ctx.matchedActivity, so this
// never re-queries activities/planned_hikes itself). The ghost-trail
// determination lives in computeSI.ts (it isn't part of ActivitySignal).
import type { ActivitySignal, SignalContext } from '@/lib/si/types'

const HEATMAP_PENALTY = -10 // TODO: Strava heatmap tile analysis

export async function collectActivitySignal(_osmRelationId: number, ctx: SignalContext): Promise<ActivitySignal> {
  try {
    const match = ctx.matchedActivity
    let dtrekBonus = 0
    if (match) {
      const months = (Date.now() - new Date(match.recencyDate).getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (months < 3) dtrekBonus = 15
      else if (months <= 12) dtrekBonus = 5
    }
    return { dtrekBonus, heatmapPenalty: HEATMAP_PENALTY }
  } catch {
    return { dtrekBonus: 0, heatmapPenalty: HEATMAP_PENALTY }
  }
}
