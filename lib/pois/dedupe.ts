import type { PoiItem } from '@/lib/overpass'
import { haversineM } from '@/lib/geoUtils'

// Source priority for deduplication (lower = higher quality)
const SOURCE_PRIORITY: Record<string, number> = {
  ptpr_lazio: 1,
  gna:        2,
  wikidata:   3,
  overpass:   4,
}

// ── Deduplication with source priority ───────────────────────────────────────

export function deduplicateByProximity(pois: PoiItem[], thresholdM = 50): PoiItem[] {
  const kept: PoiItem[] = []
  for (const poi of pois) {
    const poiSource = poi.tags?.source as string | undefined
    const duplicate = kept.find(k => haversineM(poi.lat, poi.lon, k.lat, k.lon) < thresholdM)
    if (!duplicate) {
      kept.push(poi)
    } else {
      const newPrio = SOURCE_PRIORITY[poiSource ?? 'overpass'] ?? 4
      const oldPrio = SOURCE_PRIORITY[(duplicate.tags?.source as string | undefined) ?? 'overpass'] ?? 4
      if (newPrio < oldPrio) {
        kept[kept.indexOf(duplicate)] = poi
      }
    }
  }
  return kept
}
