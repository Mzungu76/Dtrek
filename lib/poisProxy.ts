import type { PoiItem } from './overpass'
import { computeBbox, minDistToTrack } from './geoUtils'

/**
 * Fetches POIs near a GPS track via the /api/pois proxy (all 4 sources:
 * ptpr_lazio, gna, wikidata, overpass) and filters to those within radiusM.
 * Drop-in replacement for fetchHikingPoisFromWikidata.
 */
export async function fetchPoisNearTrack(
  track: [number, number][],
  radiusM = 300,
  signal?: AbortSignal,
): Promise<PoiItem[]> {
  if (track.length < 2) return []

  const bbox = computeBbox(track)
  const res = await fetch(`/api/pois?bbox=${bbox}`, { signal })
  if (!res.ok) throw new Error(`/api/pois ${res.status}`)

  const all = (await res.json()) as PoiItem[]

  return all
    .map(poi => {
      const dist = minDistToTrack(poi.lat, poi.lon, track)
      return { ...poi, distFromTrack: Math.round(dist) }
    })
    .filter(poi => poi.distFromTrack <= radiusM)
}
