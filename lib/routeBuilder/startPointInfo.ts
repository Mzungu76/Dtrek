// Classifica il punto di partenza di un percorso — parcheggio, punto di interesse nei pressi di un
// parcheggio, o semplicemente su strada — così chi arriva in auto sa cosa aspettarsi al trailhead
// prima di partire. Overpass-only, stessa fonte gratuita/senza chiave del resto dell'app (vedi
// lib/overpassTrails.ts) — nessuna persistenza: chiamata client-side una volta per visione della
// guida (app/api/route-build/start-point/route.ts), non vale la pena di una colonna Supabase
// dedicata per un dato così leggero ed economico da rifare al bisogno.
import { fetchOverpass } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'

export type StartPointKind = 'parcheggio' | 'poi_vicino_parcheggio' | 'strada'

export interface StartPointInfo {
  kind: StartPointKind
  label: string
  /** Nome del parcheggio/della strada, se taggato su OSM — es. "Parcheggio Pian delle Fonti". */
  name?: string
}

interface OverpassEl {
  type: 'node' | 'way' | 'relation'
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

// Un parcheggio proprio al trailhead (a piedi in pochi metri) classifica il punto come
// "Parcheggio" — oltre questo raggio ma entro PARKING_WIDE_RADIUS_M, il trailhead vero è
// probabilmente un punto di interesse con un parcheggio nei dintorni, non un parcheggio dedicato.
const PARKING_RADIUS_M = 70
const PARKING_WIDE_RADIUS_M = 300
// Una strada nominata deve toccare quasi esattamente il punto di partenza — altrimenti qualunque
// via della zona (anche lontana dal sentiero) classificherebbe erroneamente il punto come "su strada".
const ROAD_RADIUS_M = 25

function elLatLon(el: OverpassEl): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon }
  if (el.center) return el.center
  return null
}

export async function classifyStartPoint(lat: number, lon: number): Promise<StartPointInfo | null> {
  const query = `[out:json][timeout:15];
(
  nwr(around:${PARKING_WIDE_RADIUS_M},${lat},${lon})[amenity=parking];
);
out center 10;
(
  way(around:${ROAD_RADIUS_M},${lat},${lon})[highway][name];
);
out center 5;
`
  let elements: OverpassEl[]
  try {
    const data = await fetchOverpass<{ elements: OverpassEl[] }>(query, 15_000)
    elements = data.elements ?? []
  } catch {
    return null
  }

  const parkings = elements.filter(el => el.tags?.amenity === 'parking')
  const nearParking = parkings.find(p => {
    const pos = elLatLon(p)
    return pos != null && haversineM(lat, lon, pos.lat, pos.lon) <= PARKING_RADIUS_M
  })
  if (nearParking) {
    return { kind: 'parcheggio', label: 'Parcheggio', name: nearParking.tags?.name }
  }
  if (parkings.length > 0) {
    return { kind: 'poi_vicino_parcheggio', label: 'Punto di interesse, parcheggio nei pressi' }
  }

  const road = elements.find(el => el.tags?.highway && el.tags?.name)
  if (road) {
    return { kind: 'strada', label: 'Su strada', name: road.tags?.name }
  }

  return null
}
