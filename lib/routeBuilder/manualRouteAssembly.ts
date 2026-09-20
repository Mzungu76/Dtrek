// Logica pura (nessun DOM/Leaflet) dell'editor manuale dei percorsi
// (components/upload/ManualRouteEditor.tsx) — isolata qui per restare testabile senza montare una
// mappa. Due responsabilità distinte:
// - tryAddSegment: aggancia un nuovo tratto cliccato a un'estremità del percorso in costruzione,
//   rifiutando (nessun collegamento automatico) un tratto che non tocca né l'inizio né la fine.
// - splitPolylineAtJunctions: spezza la geometria di un Percorso censito nei suoi sotto-tratti,
//   preferendo le giunzioni già note della rete OSM grezza della stessa viewport (un vero incrocio)
//   e ripiegando sui vertici propri della sua spezzata quando non ne conosce nessuna — mai l'intero
//   Percorso resta un solo tratto indivisibile.
import { haversineM } from '@/lib/geoUtils'

// Le geometrie dei Percorsi censiti (tabella `trails`) sono campionate ogni ~200m
// (geometry_simplified, vedi supabase-schema.sql) — non nodi esatti condivisi come la rete grezza
// (WalkNetwork). Una tolleranza troppo stretta lascerebbe quasi ogni tratto "non toccante" per un
// semplice errore di campionamento, non per una reale mancata connessione sul terreno. Stessa
// soglia riusata sia per la validazione di tocco fra tratti sia per la spezzatura ai nodi di
// giunzione — coerenza fra le due, non due numeri arbitrari scelti indipendentemente.
export const SNAP_TOLERANCE_M = 50

// Un Percorso censito (tabella `trails`, campionato ogni ~200m) e un tratto di rete OSM grezza
// (nodi esatti) sono digitalizzati da fonti indipendenti: anche quando sono davvero lo stesso
// incrocio sul terreno, l'estremo registrato del Percorso può cadere fino a ~150-200m dal vero
// punto di giunzione lungo la traccia — un errore diverso (e più grande) di quello di solo
// campionamento entro la stessa fonte che giustifica SNAP_TOLERANCE_M sopra. Tolleranza più larga
// SOLO quando le due estremità a confronto vengono da fonti diverse (mai fra due tratti della
// stessa fonte, dove resta valida quella stretta): altrimenti un cambio di tipologia che in realtà
// è continuo sul terreno (es. un CAI censito che prosegue come sentiero della rete grezza) viene
// scartato più spesso di quanto dovrebbe.
export const CROSS_SOURCE_SNAP_TOLERANCE_M = 120

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

/** Fonte di un tratto — 'trail' = Percorso censito (tabella `trails`), 'network' = rete OSM grezza
 *  (vedi lib/routeBuilder/osmGraph.ts's buildNetworkSegments). Solo per scegliere la tolleranza di
 *  aggancio in tryAddSegment, mai per filtrare quali tratti sono cliccabili/collegabili. */
export type SegmentSource = 'trail' | 'network'

export interface SegmentKindContext {
  /** Fonte del tratto già in `routePoints` dal lato inizio (per i candidati "prepend" sotto). */
  routeStartKind?: SegmentSource
  /** Fonte del tratto già in `routePoints` dal lato fine (per i candidati "append" sotto). */
  routeEndKind?: SegmentSource
  /** Fonte di `newSegment`. */
  newKind?: SegmentSource
}

/**
 * Prova ad agganciare `newSegment` a un capo di `routePoints` (l'intero percorso assemblato finora,
 * per il solo confronto di distanza — il chiamante gestisce la lista di parti). Il percorso vuoto
 * accetta qualunque primo tratto così com'è. Altrimenti prova le 4 combinazioni possibili (l'inizio
 * o la fine del percorso contro l'inizio o la fine del nuovo tratto), ciascuna con la propria
 * tolleranza (più larga quando le due fonti coinvolte in quel confronto sono diverse — vedi
 * CROSS_SOURCE_SNAP_TOLERANCE_M — altrimenti `snapToleranceM`; senza `kinds` tutte usano
 * `snapToleranceM`, comportamento invariato), e sceglie l'aggancio più comodo rispetto alla propria
 * soglia (distanza meno tolleranza più piccola) — così un percorso quasi ad anello (entrambe le
 * estremità entro tolleranza) sceglie comunque l'aggancio più stretto, non il primo controllato per
 * ordine. Se nessuna delle 4 combinazioni rientra nella propria tolleranza, il tratto viene
 * rifiutato: nessun collegamento automatico dei buchi.
 */
export function tryAddSegment(
  routePoints: [number, number][],
  newSegment: [number, number][],
  snapToleranceM = SNAP_TOLERANCE_M,
  kinds?: SegmentKindContext,
): AddSegmentResult {
  if (newSegment.length < 2) return { ok: false, reason: 'Tratto non valido.' }
  if (routePoints.length === 0) return { ok: true, orientedPoints: newSegment, attachedAt: 'end' }

  const routeStart = routePoints[0]
  const routeEnd = routePoints[routePoints.length - 1]
  const segStart = newSegment[0]
  const segEnd = newSegment[newSegment.length - 1]

  const toleranceFor = (routeSideKind: SegmentSource | undefined): number =>
    routeSideKind && kinds?.newKind && routeSideKind !== kinds.newKind ? CROSS_SOURCE_SNAP_TOLERANCE_M : snapToleranceM

  const appendTol = toleranceFor(kinds?.routeEndKind)
  const prependTol = toleranceFor(kinds?.routeStartKind)

  const candidates = [
    { d: haversineM(routeEnd[0], routeEnd[1], segStart[0], segStart[1]), kind: 'append' as const, reversed: false, tol: appendTol },
    { d: haversineM(routeEnd[0], routeEnd[1], segEnd[0], segEnd[1]), kind: 'append' as const, reversed: true, tol: appendTol },
    { d: haversineM(routeStart[0], routeStart[1], segStart[0], segStart[1]), kind: 'prepend' as const, reversed: true, tol: prependTol },
    { d: haversineM(routeStart[0], routeStart[1], segEnd[0], segEnd[1]), kind: 'prepend' as const, reversed: false, tol: prependTol },
  ]
  // Il candidato più "comodo" rispetto alla propria tolleranza (non la sola distanza minima): con
  // tolleranze diverse fra candidati un aggancio leggermente più lontano ma nella sua soglia larga
  // deve poter vincere su uno più vicino ma già fuori dalla sua soglia stretta.
  const best = candidates.reduce((a, b) => (b.d - b.tol < a.d - a.tol ? b : a))
  if (best.d > best.tol) {
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
 * viewport — vedi lib/routeBuilder/osmGraph.ts's buildNetworkSegments) — un vero incrocio/
 * deviazione, il taglio preferito quando esiste. Se nessun vertice del Percorso cade vicino a una
 * giunzione nota (rete grezza non ancora caricata per questa zona, o il Percorso non ne incrocia
 * nessuna in quest'area) NON lascia comunque l'intero Percorso un solo tratto indivisibile: un
 * Percorso censito deve sempre poter essere selezionato un tratto alla volta, non tutto insieme —
 * il ripiego usa allora ogni vertice della sua stessa spezzata originale (`geometry_simplified`,
 * campionata ogni ~200m) come confine di taglio valido. In entrambi i casi un candidato di taglio è
 * scartato se produrrebbe un sotto-tratto più corto di `minSegmentLengthM` rispetto al taglio
 * precedente O rispetto alla fine della polilinea — evita di frammentare per pochi metri quando due
 * giunzioni (o due vertici del ripiego) sono vicinissimi fra loro o cadono appena prima dell'estremo
 * finale.
 */
export function splitPolylineAtJunctions(
  points: [number, number][],
  junctionPoints: [number, number][],
  snapToleranceM = SNAP_TOLERANCE_M,
  minSegmentLengthM = SNAP_TOLERANCE_M,
): [number, number][][] {
  if (points.length < 2) return [points]

  const cumDist: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]))
  }
  const totalDist = cumDist[cumDist.length - 1]

  function collectCuts(isCandidate: (i: number) => boolean): number[] {
    const cuts: number[] = []
    for (let i = 1; i < points.length - 1; i++) {
      if (!isCandidate(i)) continue
      const lastCutDist = cuts.length ? cumDist[cuts[cuts.length - 1]] : 0
      if (cumDist[i] - lastCutDist < minSegmentLengthM) continue
      if (totalDist - cumDist[i] < minSegmentLengthM) continue
      cuts.push(i)
    }
    return cuts
  }

  let cutIndices = collectCuts(i => {
    const [lat, lon] = points[i]
    return junctionPoints.some(([jLat, jLon]) => haversineM(lat, lon, jLat, jLon) <= snapToleranceM)
  })
  // Ripiego: nessun vertice tocca una giunzione nota — spezza comunque sui vertici propri del
  // Percorso, mai un errore né un tratto unico indivisibile.
  if (cutIndices.length === 0) cutIndices = collectCuts(() => true)
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
