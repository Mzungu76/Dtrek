import type { PoiItem } from './overpass'
import { computeBbox, minDistToTrack } from './geoUtils'
import { bboxBufferMeters } from './geo/bufferUtils'

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

  // Cheap bbox pre-filter before the O(track.length) per-segment distance scan below — a POI
  // outside the track's bbox (padded by radiusM) can't be within radiusM of any point on the
  // track (which lies entirely inside its own bbox), so skip the expensive scan for it.
  const [minLat, minLon, maxLat, maxLon] = bboxBufferMeters(track, radiusM).split(',').map(Number)

  return all
    .filter(poi => poi.lat >= minLat && poi.lat <= maxLat && poi.lon >= minLon && poi.lon <= maxLon)
    .map(poi => {
      const dist = minDistToTrack(poi.lat, poi.lon, track)
      return { ...poi, distFromTrack: Math.round(dist) }
    })
    .filter(poi => poi.distFromTrack <= radiusM)
}
