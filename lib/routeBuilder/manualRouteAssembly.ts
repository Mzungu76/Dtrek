// Logica pura (nessun DOM/Leaflet) dell'editor manuale dei percorsi
// (components/upload/ManualRouteEditor.tsx) — isolata qui per restare testabile senza montare una
// mappa. Due responsabilità distinte:
// - tryAddSegment: aggancia un nuovo tratto cliccato a un'estremità del percorso in costruzione,
//   rifiutando (nessun collegamento automatico) un tratto che non tocca né l'inizio né la fine.
// - splitPolylineAtJunctions: spezza la geometria di un Percorso censito nei suoi sotto-tratti
//   logici, riusando le giunzioni già note della rete OSM grezza della stessa viewport.
import { haversineM } from '@/lib/geoUtils'

// Le geometrie dei Percorsi censiti (tabella `trails`) sono campionate ogni ~200m
// (geometry_simplified, vedi supabase-schema.sql) — non nodi esatti condivisi come la rete grezza
// (WalkNetwork). Una tolleranza troppo stretta lascerebbe quasi ogni tratto "non toccante" per un
// semplice errore di campionamento, non per una reale mancata connessione sul terreno. Stessa
// soglia riusata sia per la validazione di tocco fra tratti sia per la spezzatura ai nodi di
// giunzione — coerenza fra le due, non due numeri arbitrari scelti indipendentemente.
export const SNAP_TOLERANCE_M = 50

export interface AddSegmentResult {
  ok: boolean
  /** Il nuovo tratto, riorientato se necessario perché il suo primo punto tocchi il capo del
   *  percorso a cui si aggancia — mai il percorso intero: il chiamante tiene un elenco ordinato di
   *  parti (components/upload/ManualRouteEditor.tsx) e concatena da sé, scartando il punto di
   *  contatto duplicato fra una parte e la successiva. */
  orientedPoints?: [number, number][]
  /** 'end' = va accodato dopo l'ultima parte, 'start' = prima della prima. Per il primo tratto
   *  (percorso ancora vuoto) è sempre 'end' per convenzione, senza un vero significato. */
  attachedAt?: 'start' | 'end'
  reason?: string
}

/**
 * Prova ad agganciare `newSegment` a un capo di `routePoints` (l'intero percorso assemblato finora,
 * per il solo confronto di distanza — il chiamante gestisce la lista di parti). Il percorso vuoto
 * accetta qualunque primo tratto così com'è. Altrimenti prova le 4 combinazioni possibili (l'inizio
 * o la fine del percorso contro l'inizio o la fine del nuovo tratto) e sceglie l'aggancio più
 * vicino in assoluto — così un percorso quasi ad anello (entrambe le estremità entro tolleranza)
 * sceglie comunque l'aggancio più stretto, non il primo controllato per ordine. Se nessuna delle 4
 * combinazioni è entro `snapToleranceM`, il tratto viene rifiutato: nessun collegamento automatico
 * dei buchi.
 */
export function tryAddSegment(
  routePoints: [number, number][],
  newSegment: [number, number][],
  snapToleranceM = SNAP_TOLERANCE_M,
): AddSegmentResult {
  if (newSegment.length < 2) return { ok: false, reason: 'Tratto non valido.' }
  if (routePoints.length === 0) return { ok: true, orientedPoints: newSegment, attachedAt: 'end' }

  const routeStart = routePoints[0]
  const routeEnd = routePoints[routePoints.length - 1]
  const segStart = newSegment[0]
  const segEnd = newSegment[newSegment.length - 1]

  const candidates = [
    { d: haversineM(routeEnd[0], routeEnd[1], segStart[0], segStart[1]), kind: 'append' as const, reversed: false },
    { d: haversineM(routeEnd[0], routeEnd[1], segEnd[0], segEnd[1]), kind: 'append' as const, reversed: true },
    { d: haversineM(routeStart[0], routeStart[1], segStart[0], segStart[1]), kind: 'prepend' as const, reversed: true },
    { d: haversineM(routeStart[0], routeStart[1], segEnd[0], segEnd[1]), kind: 'prepend' as const, reversed: false },
  ]
  const best = candidates.reduce((a, b) => (b.d < a.d ? b : a))
  if (best.d > snapToleranceM) {
    return { ok: false, reason: "Questo tratto non tocca il percorso: scegli un tratto adiacente a un'estremità." }
  }

  const oriented = best.reversed ? [...newSegment].reverse() : newSegment
  return { ok: true, orientedPoints: oriented, attachedAt: best.kind === 'append' ? 'end' : 'start' }
}

/**
 * Concatena le `points` di un elenco ordinato di parti del percorso (già orientate da
 * `tryAddSegment`) in un'unica polilinea, scartando il punto di contatto duplicato fra una parte e
 * la successiva — l'unica fonte di verità di `routePoints` in ManualRouteEditor.tsx, derivata da
 * `parts` invece di essere mantenuta come stato indipendente (mai due copie della stessa cosa che
 * potrebbero disallinearsi).
 */
export function assembleRoutePoints(partsPoints: [number, number][][]): [number, number][] {
  const result: [number, number][] = []
  for (const points of partsPoints) {
    if (result.length === 0) result.push(...points)
    else result.push(...points.slice(1))
  }
  return result
}

/**
 * Distanza approssimata (metri) percorsa lungo `routePoints` fino al vertice più vicino a (lat,
 * lon) — usata solo per ordinare i PIN inclusi nel percorso per badge numerato (posizione lungo il
 * percorso, non ordine di click). Approssima con il vertice più vicino invece di una proiezione
 * perpendicolare esatta sul segmento: sufficiente per l'ordinamento di un badge in UI, non per un
 * calcolo di distanza mostrato all'utente.
 */
export function nearestRouteVertexDistance(routePoints: [number, number][], lat: number, lon: number): number {
  if (routePoints.length === 0) return 0
  let cum = 0
  let bestCum = 0
  let bestDist = Infinity
  for (let i = 0; i < routePoints.length; i++) {
    if (i > 0) cum += haversineM(routePoints[i - 1][0], routePoints[i - 1][1], routePoints[i][0], routePoints[i][1])
    const d = haversineM(lat, lon, routePoints[i][0], routePoints[i][1])
    if (d < bestDist) { bestDist = d; bestCum = cum }
  }
  return bestCum
}

/**
 * Spezza `points` (la geometria di un Percorso censito) nei punti in cui passa vicino a una
 * giunzione nota (`junctionPoints`, tipicamente gli estremi dei NetworkSegment della stessa
 * viewport — vedi lib/routeBuilder/osmGraph.ts's buildNetworkSegments). Un candidato di taglio è
 * scartato se produrrebbe un sotto-tratto più corto di `minSegmentLengthM` rispetto al taglio
 * precedente O rispetto alla fine della polilinea — evita di frammentare per pochi metri quando
 * due giunzioni sono vicinissime fra loro o una giunzione cade appena prima dell'estremo finale.
 * Nessuna giunzione nota (es. layer Sentieri non ancora caricato per la viewport corrente) o
 * nessun candidato valido → l'intera polilinea resta un solo sotto-tratto, mai un errore.
 */
export function splitPolylineAtJunctions(
  points: [number, number][],
  junctionPoints: [number, number][],
  snapToleranceM = SNAP_TOLERANCE_M,
  minSegmentLengthM = SNAP_TOLERANCE_M,
): [number, number][][] {
  if (points.length < 2 || junctionPoints.length === 0) return [points]

  const cumDist: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]))
  }
  const totalDist = cumDist[cumDist.length - 1]

  const cutIndices: number[] = []
  for (let i = 1; i < points.length - 1; i++) {
    const [lat, lon] = points[i]
    const nearJunction = junctionPoints.some(([jLat, jLon]) => haversineM(lat, lon, jLat, jLon) <= snapToleranceM)
    if (!nearJunction) continue
    const lastCutDist = cutIndices.length ? cumDist[cutIndices[cutIndices.length - 1]] : 0
    if (cumDist[i] - lastCutDist < minSegmentLengthM) continue
    if (totalDist - cumDist[i] < minSegmentLengthM) continue
    cutIndices.push(i)
  }
  if (cutIndices.length === 0) return [points]

  const segments: [number, number][][] = []
  let segStart = 0
  for (const idx of cutIndices) {
    segments.push(points.slice(segStart, idx + 1))
    segStart = idx
  }
  segments.push(points.slice(segStart))
  return segments
}
