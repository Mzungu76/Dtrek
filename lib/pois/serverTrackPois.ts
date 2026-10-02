import type { PoiItem } from '@/lib/overpass'
import { minDistToTrack } from '@/lib/geoUtils'
import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { fetchGnaPois } from './gnaSource'
import { fetchPtprPois } from './ptprSource'
import { fetchWikidataPois } from './wikidataSource'
import { fetchOverpassPois } from './overpassSource'
import { deduplicateByProximity } from './dedupe'

/**
 * Luoghi entro `radiusM` da una traccia, letti lato SERVER dalle stesse quattro fonti di /api/pois
 * (GNA, PTPR, Wikidata, Overpass). lib/overpass.ts's fetchPoisNearTrack e lib/poisProxy.ts usano URL
 * relativi e funzionano solo nel browser: da una route API fallivano in silenzio e restituivano
 * "nessun luogo". `okSources` dice quante fonti hanno risposto — con 0 il chiamante non deve
 * mettere in cache un elenco vuoto.
 */
export async function fetchPoisAlongTrackServer(
  track: [number, number][],
  radiusM = 300,
): Promise<{ pois: PoiItem[]; okSources: number }> {
  if (track.length < 2) return { pois: [], okSources: 0 }
  const bbox = bboxBufferMeters(track, radiusM)
  const results = await Promise.allSettled([
    fetchGnaPois(bbox), fetchPtprPois(bbox), fetchWikidataPois(bbox), fetchOverpassPois(bbox),
  ])
  const all: PoiItem[] = []
  let okSources = 0
  for (const r of results) {
    if (r.status === 'fulfilled') { okSources++; all.push(...r.value) }
    else console.warn('[pois] fonte non disponibile:', r.reason instanceof Error ? r.reason.message : r.reason)
  }
  const pois = deduplicateByProximity(all, 50)
    .map(p => ({ ...p, distFromTrack: Math.round(minDistToTrack(p.lat, p.lon, track)) }))
    .filter(p => p.distFromTrack <= radiusM)
    .sort((a, b) => Number(!!b.name) - Number(!!a.name) || a.distFromTrack - b.distFromTrack)
  return { pois, okSources }
}
