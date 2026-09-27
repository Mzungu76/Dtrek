import { haversineM } from '@/lib/geoUtils'
import { nearestPolylineIndex, type BorgoWalkTappaEnd } from '@/lib/borgoWalkPolyline'
import type { RouteMoment } from './types'

/**
 * Trasforma i confini di tappa di un Borgo/Città (persistiti in PlannedHike.borgoWalkTappaEnds,
 * lib/borgoWalkPolyline.ts) in RouteMoment 'tappa_end' per NavigationEngine — Navigator "Modalità
 * A" (sessione conversazionale): una sola sessione di navigazione che segnala il confine tra
 * tappe invece di trattare un itinerario su più giornate come un cammino continuo.
 *
 * `polyline` è quella davvero passata al motore (hike.routePolyline, già risolta da
 * effectiveNavPolyline a monte) — la distanza lungo il percorso di ogni confine si ricava da QUESTA
 * traccia, mai da una ricalcolata a parte, per restare coerente con RouteTracker che userà la
 * stessa polyline per il proprio calcolo di avanzamento.
 *
 * Un confine troppo lontano da ogni punto della polyline (nearestPolylineIndex torna null) viene
 * scartato invece di piazzato alla meno peggio: l'itinerario è probabilmente cambiato da quando il
 * confine è stato salvato (nuove tappe, riordino) — meglio nessun avviso di fine tappa che uno nel
 * punto sbagliato.
 */
export function buildTappaEndMoments(
  polyline: [number, number][],
  tappaEnds: BorgoWalkTappaEnd[] | undefined,
): RouteMoment[] {
  if (!tappaEnds || tappaEnds.length === 0 || polyline.length < 2) return []

  const cumulativeM: number[] = [0]
  for (let i = 1; i < polyline.length; i++) {
    cumulativeM.push(cumulativeM[i - 1] + haversineM(polyline[i - 1][0], polyline[i - 1][1], polyline[i][0], polyline[i][1]))
  }

  const tappaCount = tappaEnds.length + 1
  const moments: RouteMoment[] = []
  tappaEnds.forEach((end, i) => {
    const idx = nearestPolylineIndex(polyline, end)
    if (idx == null) return
    moments.push({
      id: `tappa-end-${i}`,
      lat: end.lat,
      lon: end.lon,
      distanceAlongRouteM: cumulativeM[idx],
      kind: 'tappa_end',
      text: `Tappa ${i + 1} di ${tappaCount} completata.`,
      tappaIndex: i,
      tappaCount,
    })
  })
  return moments
}
