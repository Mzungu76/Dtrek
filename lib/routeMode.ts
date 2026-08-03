/**
 * Tipologia di percorrenza di un percorso a tratta unica (lineare): lo si cammina solo all'andata,
 * o si torna sui propri passi fino al punto di partenza?
 *
 * È una proprietà del percorso persistita su planned_hikes.route_mode, non uno stato di sola
 * visualizzazione: le cifre effettive (distanza, dislivello, durata) raddoppiano in 'round_trip', e
 * da quelle dipendono TEI/Comfort TrailScore — vedi effectiveHikeMetrics qui sotto e i suoi
 * chiamanti in lib/computeCtsForHike.ts e lib/computeSafetyForHike.ts.
 *
 * Vale solo per i percorsi lineari (classifyTrackShape === 'linear'): un anello è già un giro
 * completo e un andata-ritorno rilevato come tale dalla geometria ha già entrambe le tratte nella
 * traccia, quindi in quei casi la domanda non ha senso e routeMode resta undefined per sempre.
 */
export type RouteMode = 'one_way' | 'round_trip'

export const ROUTE_MODE_LABEL: Record<RouteMode, string> = {
  one_way:    'Sola andata',
  round_trip: 'Andata e ritorno',
}

export function isRouteMode(v: unknown): v is RouteMode {
  return v === 'one_way' || v === 'round_trip'
}

/** Le cifre di un percorso lineare raddoppiano quando si torna sui propri passi. */
export function routeModeMultiplier(mode: RouteMode | undefined | null): 1 | 2 {
  return mode === 'round_trip' ? 2 : 1
}

export interface HikeMetrics {
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  estimatedTimeSeconds: number
}

/**
 * Le cifre da usare ovunque conti quanto si cammina davvero (punteggi, statistiche, prompt AI) al
 * posto di quelle grezze della traccia.
 *
 * Raddoppio semplice, non salita+discesa incrociate: sulla via del ritorno la salita dell'andata
 * diventa discesa e viceversa, quindi il totale reale di ciascuna è (gain + loss) — ma
 * elevationLoss è più esposto al rumore GPS/DTM di elevationGain (piccoli saliscendi che si
 * accumulano) e l'app mostra da sempre solo "Dislivello" = elevationGain. Raddoppiare ciascuna
 * grandezza per conto proprio tiene le cifre mostrate coerenti con quel dato già verificato invece
 * di introdurne uno mai visto in UI, e per un percorso reale le due formule differiscono poco.
 *
 * altitudeMax/altitudeMin restano invariate: tornare indietro non porta più in alto.
 */
export function effectiveHikeMetrics<T extends HikeMetrics>(hike: T, mode?: RouteMode | null): HikeMetrics {
  const k = routeModeMultiplier(mode)
  return {
    distanceMeters:       hike.distanceMeters * k,
    elevationGain:        hike.elevationGain * k,
    elevationLoss:        hike.elevationLoss * k,
    estimatedTimeSeconds: hike.estimatedTimeSeconds * k,
  }
}
