// Taglia dall'inizio (e dalla fine: gli anelli tornano a casa) i punti di una traccia pubblica
// entro un raggio dal punto di partenza salvato in profilo — docs/raccolte-pubblicazione-piano.md,
// Fase 3f. Un archivio pubblico di tracce che partono sempre dallo stesso punto è una mappa di
// dove abita l'autore; questo non anonimizza la traccia (il grosso del percorso resta, in chiaro),
// riduce solo l'unico segnale che si ripete identico uscita dopo uscita.
//
// La polyline pubblica è già ridotta a ~60 punti in scrittura (lib/downsamplePolyline.ts): il
// taglio è quindi grossolano per costruzione, un punto scartato può valere più di 100 metri reali
// — da qui un raggio generoso (1 km di default): meglio togliere un tornante in più che lasciarne
// uno riconoscibile.
import { haversineM } from '../geoUtils'

export interface HomePoint {
  lat: number
  lon: number
}

export function trimHomeStart(
  polyline: [number, number][],
  home: HomePoint | null,
  radiusKm = 1,
): [number, number][] {
  if (!home || polyline.length < 2) return polyline

  const radiusM = radiusKm * 1000
  const withinRadius = (p: [number, number]) => haversineM(home.lat, home.lon, p[0], p[1]) <= radiusM

  let start = 0
  while (start < polyline.length && withinRadius(polyline[start])) start++

  let end = polyline.length - 1
  while (end > start && withinRadius(polyline[end])) end--

  const trimmed = polyline.slice(start, end + 1)

  // Un'intera traccia dentro il raggio (es. un giro dell'isolato) non deve sparire: la privacy non
  // deve rompere la pagina — meglio mostrare la traccia intera che una mappa vuota o a un solo punto.
  return trimmed.length >= 2 ? trimmed : polyline
}
