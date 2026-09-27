import type { BorgoItinerary } from '@/app/api/borgo-itinerary/route'
import { haversineM } from './geoUtils'

// Calcolo condiviso tra components/guida/GuideReader.tsx (alla prima apertura della guida) e
// lib/useCreateMetaFromSearch.ts (alla creazione, piano guide-eccellenza — verifica post-piano:
// "l'algoritmo deve partire sia su 'Genera automatico' sia su 'Crea Guida'") — un solo posto che
// decide come un BorgoItinerary diventa i due campi da persistere su planned_hikes, mai due
// implementazioni che potrebbero andare fuori sincrono.

export interface BorgoWalkTappaEnd {
  lat: number
  lon: number
}

export interface BorgoWalkFields {
  borgoWalkPolyline: [number, number][]
  borgoWalkStopsHash: string
  /** Coordinate dell'ultimo punto di ogni tappa TRANNE l'ultima (sessione conversazionale, Navigator
   *  "Modalità A" — una sola sessione di navigazione che segnala il confine tra tappe invece di
   *  trattare un Borgo su più giornate come un cammino continuo). Assente per un itinerario a tappa
   *  unica (il caso comune: mezza giornata/giornata intera) — nessun confine da segnalare. Usato da
   *  lib/navigation/borgoTappaMoments.ts per costruire i RouteMoment 'tappa_end' del motore di
   *  navigazione, mai per ricostruire l'itinerario stesso (quello resta borgoWalkPolyline/tappe). */
  borgoWalkTappaEnds?: BorgoWalkTappaEnd[]
}

/** Concatenazione in ordine delle `legs[].polyline` (reali o linea d'aria di ripiego, mai un dato
 *  fabbricato qui: quello che c'è già in `legs` così com'è) + hash delle tappe da cui deriva
 *  (per capire quando ricalcolare, non un timestamp — vedi il commento su borgoWalkPolyline in
 *  lib/plannedStore.ts). null quando l'itinerario non ha tappe collegate da un cammino: nulla da
 *  persistere, mai un campo vuoto scritto per forza. */
export function computeBorgoWalkFields(itinerary: BorgoItinerary): BorgoWalkFields | null {
  if (itinerary.legs.length === 0) return null
  const borgoWalkTappaEnds = itinerary.tappe.length > 1
    ? itinerary.tappe.slice(0, -1).map((tappa) => {
        const lastStop = tappa.stops[tappa.stops.length - 1]
        return { lat: lastStop.lat, lon: lastStop.lon }
      })
    : undefined
  return {
    borgoWalkPolyline: itinerary.legs.flatMap(leg => leg.polyline),
    borgoWalkStopsHash: itinerary.stops.map(s => s.id).join(','),
    borgoWalkTappaEnds,
  }
}

/** Polyline da usare per navigare/elencare una Meta come "percorso pronto" — routePolyline (traccia
 *  GPS reale) quando c'è, altrimenti il ripiego già previsto dal commento su borgoWalkPolyline in
 *  lib/plannedStore.ts ("usato dal Navigator come ripiego"), finora implementato solo in
 *  app/guida/[id]/naviga/page.tsx. Un Sito non ha né l'uno né l'altro (nessun percorso da seguire,
 *  è un punto) — undefined è la risposta corretta, non un errore da gestire a parte. Da usare SOLO
 *  per la resa locale (filtri/mappa/navigazione): mai scrivere il risultato indietro su
 *  routePolyline, altrimenti borgoCardVariant/metaEligibleForHikingScores (lib/guideCardVariant.ts)
 *  riclasserebbero per errore l'itinerario generato come una vera traccia GPS. */
export function effectiveNavPolyline(
  hike: { routePolyline?: [number, number][]; borgoWalkPolyline?: [number, number][] },
): [number, number][] | undefined {
  return hike.routePolyline?.length ? hike.routePolyline : hike.borgoWalkPolyline
}

// "In zona", non un match esatto sul vertice — la coordinata del confine è l'ultimo stop di una
// tappa che i legs attraversano davvero, ma un arrotondamento nella concatenazione delle polyline o
// un itinerario leggermente cambiato da quando il confine è stato salvato non deve impedire di
// trovare il punto giusto.
const TAPPA_BOUNDARY_MATCH_RADIUS_M = 80

/** Indice del punto di `polyline` più vicino a `point`, cercando solo da `fromIndex` in avanti (per
 *  trovare più confini nell'ordine giusto invece di poter tornare a un punto già superato) — null
 *  se il più vicino resta comunque oltre TAPPA_BOUNDARY_MATCH_RADIUS_M: l'itinerario è
 *  probabilmente cambiato da quando il confine è stato salvato, meglio nessun match che uno forzato
 *  sul meno peggio. Condivisa tra lib/navigation/borgoTappaMoments.ts (RouteMoment 'tappa_end') e
 *  splitPolylineByTappaEnds sotto (segmenti del GPX esportato) — stesso criterio di "abbastanza
 *  vicino", mai due soglie diverse per lo stesso concetto. */
export function nearestPolylineIndex(
  polyline: [number, number][],
  point: { lat: number; lon: number },
  fromIndex = 0,
): number | null {
  let nearestIdx = -1
  let nearestDistM = Infinity
  for (let i = fromIndex; i < polyline.length; i++) {
    const d = haversineM(point.lat, point.lon, polyline[i][0], polyline[i][1])
    if (d < nearestDistM) { nearestDistM = d; nearestIdx = i }
  }
  return nearestIdx !== -1 && nearestDistM <= TAPPA_BOUNDARY_MATCH_RADIUS_M ? nearestIdx : null
}

/** Spezza una polyline in tanti segmenti quante sono le tappe (`tappaEnds.length + 1`), per un GPX
 *  esportato con un `<trkseg>` per tappa invece di un'unica traccia continua (Navigator "Modalità
 *  A" — un Borgo/Città su più giornate deve restare riconoscibile come tale anche in un file GPX
 *  aperto su un altro dispositivo, non solo dentro l'app). Ogni confine chiude un segmento e apre
 *  il successivo dallo STESSO punto (coerente con come le tappe si concatenano già in
 *  computeBorgoWalkFields — "tappaStart" è l'ultimo stop della tappa precedente), mai un salto.
 *
 * Rinuncia a spezzare (un solo segmento, l'intera polyline) se anche un solo confine non trova un
 * punto abbastanza vicino: un GPX con un segmento di troppo o mal posizionato è peggio di uno privo
 * di segmentazione, che resta comunque corretto come traccia. */
export function splitPolylineByTappaEnds(
  polyline: [number, number][],
  tappaEnds: BorgoWalkTappaEnd[] | undefined,
): [number, number][][] {
  if (!tappaEnds || tappaEnds.length === 0 || polyline.length < 2) return [polyline]
  const segments: [number, number][][] = []
  let start = 0
  for (const end of tappaEnds) {
    const idx = nearestPolylineIndex(polyline, end, start)
    if (idx == null || idx <= start) return [polyline]
    segments.push(polyline.slice(start, idx + 1))
    start = idx
  }
  segments.push(polyline.slice(start))
  return segments
}
