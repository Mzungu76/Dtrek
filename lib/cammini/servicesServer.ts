import { USER_AGENT } from '@/lib/pois/shared'
import { buildServicesQuery, servicesAlongTrack, servicesBbox, type ServiceItem } from './services'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

/** Servizi entro `radiusM` dalla traccia (lato server). Lancia se nessun endpoint risponde: un elenco vuoto non va messo in cache come se fosse una risposta. */
export async function fetchServicesAlongTrack(track: [number, number][], radiusM = 600): Promise<ServiceItem[]> {
  if (track.length < 2) return []
  const query = buildServicesQuery(servicesBbox(track, radiusM))
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
      return servicesAlongTrack(data.elements ?? [], track, radiusM)
    } catch {
      continue
    }
  }
  throw new Error('Overpass non raggiungibile')
}
