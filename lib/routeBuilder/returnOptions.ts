// Servizi di trasporto entro un raggio "comodo" dal punto di arrivo di un percorso a sola andata
// (fermate bus, stazioni, taxi) — per chi non vuole tornare a piedi sui propri passi. Overpass-only,
// dato reale verificabile (presenza mappata su OSM), non una stima o un'ipotesi generata: nessuna
// AI coinvolta, solo geografia. Stesso pattern/fonte di lib/routeBuilder/startPointInfo.ts.
import { fetchOverpass } from '@/lib/overpassTrails'
import { haversineM } from '@/lib/geoUtils'

export type ReturnOptionKind = 'bus' | 'treno' | 'taxi'

export interface ReturnOption {
  kind: ReturnOptionKind
  label: string
  name?: string
  distanceMeters: number
  lat: number
  lon: number
}

interface OverpassEl {
  type: 'node' | 'way' | 'relation'
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

const KIND_LABEL: Record<ReturnOptionKind, string> = {
  bus: 'Fermata bus',
  treno: 'Stazione ferroviaria',
  taxi: 'Posteggio taxi',
}

// Quante opzioni al massimo restituire — oltre questo numero l'elenco diventa poco leggibile e non
// aggiunge informazione utile (l'utente vuole sapere se c'è qualcosa nei dintorni, non l'elenco
// esaustivo di ogni fermata).
const MAX_OPTIONS = 8

function elLatLon(el: OverpassEl): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon }
  if (el.center) return el.center
  return null
}

function classify(tags: Record<string, string>): ReturnOptionKind | null {
  if (tags.highway === 'bus_stop' || tags.amenity === 'bus_station') return 'bus'
  if (tags.railway === 'station' || tags.railway === 'halt') return 'treno'
  if (tags.amenity === 'taxi') return 'taxi'
  return null
}

/** Cerca fermate bus, stazioni ferroviarie e posteggi taxi entro `radiusM` metri dal punto dato
 *  (tipicamente il punto di arrivo di un percorso a sola andata) — ordinati per distanza crescente,
 *  al massimo MAX_OPTIONS risultati complessivi. Array vuoto (mai un errore) se Overpass non
 *  risponde o non trova nulla: l'assenza di servizi nei dintorni è un'informazione valida quanto
 *  la loro presenza. */
export async function findReturnOptions(lat: number, lon: number, radiusM = 1000): Promise<ReturnOption[]> {
  const query = `[out:json][timeout:20];
(
  node(around:${radiusM},${lat},${lon})[highway=bus_stop];
  nwr(around:${radiusM},${lat},${lon})[amenity=bus_station];
  node(around:${radiusM},${lat},${lon})[railway=station];
  node(around:${radiusM},${lat},${lon})[railway=halt];
  node(around:${radiusM},${lat},${lon})[amenity=taxi];
);
out center tags;
`
  let elements: OverpassEl[]
  try {
    const data = await fetchOverpass<{ elements: OverpassEl[] }>(query, 20_000)
    elements = data.elements ?? []
  } catch {
    return []
  }

  const options: ReturnOption[] = []
  for (const el of elements) {
    const kind = el.tags ? classify(el.tags) : null
    const pos = elLatLon(el)
    if (!kind || !pos) continue
    options.push({
      kind,
      label: KIND_LABEL[kind],
      name: el.tags?.name,
      distanceMeters: Math.round(haversineM(lat, lon, pos.lat, pos.lon)),
      lat: pos.lat,
      lon: pos.lon,
    })
  }

  return options.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, MAX_OPTIONS)
}

/** Link "indicazioni a piedi" dal punto di arrivo del percorso (origin) al servizio trovato
 *  (destination) — così l'utente sa come raggiungerlo, non solo che esiste. Niente modalità
 *  "mezzi pubblici": gli orari delle linee minori quasi mai risultano disponibili, mostrarli come
 *  se ci fossero sarebbe fuorviante. Nessuna chiave/API a pagamento: è un semplice URL. */
export function buildReturnOptionMapsUrl(origin: { lat: number; lon: number }, option: ReturnOption): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.lat},${origin.lon}`,
    destination: `${option.lat},${option.lon}`,
    travelmode: 'walking',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
