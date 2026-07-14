// Tag OSM di una relation escursionistica (accesso, superficie, network...) — usati da
// /api/trails/conditions per modulare il segnale meteo (es. superficie fangosa vs roccia).
import { fetchOverpass } from '@/lib/overpassTrails'

const TIMEOUT_MS = 5000

interface OverpassTagsResponse {
  elements: Array<{ tags?: Record<string, string> }>
}

export async function fetchOsmTags(osmRelationId: number): Promise<{ tags: Record<string, string> }> {
  try {
    const query = `[out:json];relation(${osmRelationId});out tags;`
    const data = await fetchOverpass<OverpassTagsResponse>(query, TIMEOUT_MS)
    return { tags: data.elements?.[0]?.tags ?? {} }
  } catch {
    return { tags: {} }
  }
}
