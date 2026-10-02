import { bboxBufferMeters } from '@/lib/geo/bufferUtils'
import { minDistToTrack } from '@/lib/geoUtils'
import { USER_AGENT } from '@/lib/pois/shared'
import { buildServicesQuery, parseServices, type ServiceItem } from './services'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

/** Servizi entro `radiusM` dalla traccia (lato server). Lancia se nessun endpoint risponde: un elenco vuoto non va messo in cache come se fosse una risposta. */
export async function fetchServicesAlongTrack(track: [number, number][], radiusM = 600): Promise<ServiceItem[]> {
  if (track.length < 2) return []
  const query = buildServicesQuery(bboxBufferMeters(track, radiusM))
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { elements?: unknown[] }
      return parseServices(data.elements ?? [])
        .map(s => ({ ...s, distFromTrack: Math.round(minDistToTrack(s.lat, s.lon, track)) }))
        .filter(s => (s.distFromTrack ?? 0) <= radiusM)
        .sort((a, b) => (a.distFromTrack ?? 0) - (b.distFromTrack ?? 0))
    } catch {
      continue
    }
  }
  throw new Error('Overpass non raggiungibile')
}
