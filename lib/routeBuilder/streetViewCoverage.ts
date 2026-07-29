// Verifica euristica se un punto ha probabile copertura Street View reale — Google non offre un
// modo gratuito per interrogarlo direttamente (anche il solo endpoint "metadata", gratuito di per
// sé, richiede comunque una chiave Maps Platform legata a un progetto con fatturazione attiva).
// Segnale surrogato gratuito via Overpass: la presenza di una strada percorribile in auto entro un
// raggio molto stretto dal punto — le auto che fotografano Street View seguono le strade, quindi
// un punto lontano da qualunque strada (tipico per molti POI lungo i sentieri, fuori da qualunque
// carreggiata) quasi certamente non ha copertura reale. Non è una verifica esatta (falsi
// positivi/negativi possibili), ma evita di mostrare il link ovunque indiscriminatamente.
import { fetchOverpass } from '@/lib/overpassTrails'
import { computeBbox, minDistToTrack } from '@/lib/geoUtils'

// Entro quanti metri da una strada tracciata su OSM si considera plausibile la copertura.
const ROAD_RADIUS_M = 20

interface OverpassWay {
  type: 'way'
  geometry?: { lat: number; lon: number }[]
  tags?: Record<string, string>
}

/** Per ciascun punto dato (stesso ordine in ingresso/uscita), true se una strada passa entro
 *  ROAD_RADIUS_M metri — un'unica chiamata Overpass per l'intero bbox dei punti, non una per
 *  punto. Tutto false (mai un errore) se Overpass non risponde: meglio nascondere il link che
 *  mostrarlo su un punto senza copertura reale. */
export async function findLikelyStreetViewCoverage(points: { lat: number; lon: number }[]): Promise<boolean[]> {
  if (points.length === 0) return []

  const bbox = computeBbox(points.map(p => [p.lat, p.lon] as [number, number]), 0.001) // ~110 m di margine
  const [s, w, n, e] = bbox.split(',')
  const query = `[out:json][timeout:20];
way[highway](${s},${w},${n},${e});
out geom;
`
  let ways: OverpassWay[]
  try {
    const data = await fetchOverpass<{ elements: OverpassWay[] }>(query, 20_000)
    ways = (data.elements ?? []).filter(el => el.type === 'way' && (el.geometry?.length ?? 0) >= 2)
  } catch {
    return points.map(() => false)
  }

  const wayLines = ways.map(w => w.geometry!.map(pt => [pt.lat, pt.lon] as [number, number]))
  return points.map(p => wayLines.some(line => minDistToTrack(p.lat, p.lon, line) <= ROAD_RADIUS_M))
}
