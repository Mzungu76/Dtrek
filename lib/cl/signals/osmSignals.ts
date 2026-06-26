// OSM signal collector — relation tags/meta freshness, access & visibility
// penalties, operator/network trust bonus. The Overpass fetch lives here
// (fetchOsmTags) and is run once by computeCL.ts, which threads its result
// into SignalContext so weatherSignals.ts can read `surface` without a
// second Overpass round-trip for the same relation.
import { fetchOverpass } from '@/lib/overpassTrails'
import type { OsmSignal, SignalContext } from '@/lib/cl/types'

const TIMEOUT_MS = 5000

interface OverpassTagsResponse {
  elements: Array<{ tags?: Record<string, string>; timestamp?: string }>
}

export async function fetchOsmTags(osmRelationId: number): Promise<{ tags: Record<string, string>; lastModified: string | null }> {
  try {
    const query = `[out:json];relation(${osmRelationId});out tags meta;`
    const data = await fetchOverpass<OverpassTagsResponse>(query, TIMEOUT_MS)
    const el = data.elements?.[0]
    return { tags: el?.tags ?? {}, lastModified: el?.timestamp ?? null }
  } catch {
    return { tags: {}, lastModified: null }
  }
}

export async function collectOsmSignal(_osmRelationId: number, ctx: SignalContext): Promise<OsmSignal> {
  try {
    const { osmTags: tags, osmLastModified: lastModified } = ctx

    let accessPenalty = 0
    if (tags.access === 'no') accessPenalty = -60
    else if (tags.access === 'private') accessPenalty = -40

    let visibilityPenalty = 0
    if (tags.trail_visibility === 'bad' || tags.trail_visibility === 'horrible') visibilityPenalty = -35
    else if (tags.trail_visibility === 'intermediate') visibilityPenalty = -15

    let freshnessScore = 0
    if (lastModified) {
      const months = (Date.now() - new Date(lastModified).getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (months < 6) freshnessScore = 5
      else if (months < 24) freshnessScore = 0
      else if (months < 48) freshnessScore = -15
      else freshnessScore = -30
    }

    let operatorBonus = 0
    if ((tags.operator ?? '').toUpperCase().includes('CAI')) operatorBonus += 10
    if (tags.network === 'iwn' || tags.network === 'nwn') operatorBonus += 8
    else if (tags.network === 'rwn') operatorBonus += 5
    operatorBonus = Math.min(operatorBonus, 10)

    return { accessPenalty, visibilityPenalty, freshnessScore, operatorBonus, lastModified }
  } catch {
    return { accessPenalty: 0, visibilityPenalty: 0, freshnessScore: 0, operatorBonus: 0, lastModified: null }
  }
}
