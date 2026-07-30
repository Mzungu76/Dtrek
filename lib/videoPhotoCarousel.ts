// Timing/posizionamento condivisi dal video in stile "Carosello" (vedi RouteMap3D.tsx) — un'unica
// fonte usata sia dal render offline (export via canvas/WebCodecs) sia dall'anteprima interattiva,
// così l'anteprima mostra esattamente quello che il video esportato otterrà.
//
// Modello "viaggio tra una foto e l'altra": la telecamera SI FERMA davvero su ogni foto (non un
// semplice rallentamento) per il tempo di visione, poi viaggia verso la foto successiva a un ritmo
// costante proporzionale alla distanza REALE (non alla frazione di progresso, che con punti GPS
// diradati in alcuni tratti non è proporzionale alla distanza vera) — la durata del video è una
// conseguenza di questo ritmo, non un traguardo fisso da riempire.

export interface CarouselPhotoTiming { id: string; progress: number; distanceM: number }

// Zoom in aggiuntivo (livelli MapLibre) durante la sosta su una foto — piccolo accenno
// cinematografico, sale nella prima parte della sosta poi resta (non riscende: la sosta finisce e
// si riparte in viaggio, non serve un rientro morbido). Stessa funzione per render offline e
// anteprima, un'unica fonte per "quanto zoomare e quando".
export const STOP_ZOOM_BOOST = 1.1
export function stopZoomBoost(stopT: number): number {
  // Smoothstep, non lineare-poi-piatto: la derivata di t²(3-2t) è zero sia a t=0 sia a t=1, quindi
  // si annulla anche nell'espressione esterna esattamente dove il ramp si aggancia al plateau (a
  // t/0.3=1) — stesso tipo di correzione già applicata al rallentamento della telecamera, per lo
  // stesso motivo: un'accelerazione a scatti nello zoom, percepibile come uno sfarfallio.
  const t = Math.min(1, Math.max(0, stopT) / 0.3)
  return t * t * (3 - 2 * t) * STOP_ZOOM_BOOST
}

// Frazione dell'altezza dello schermo riservata in basso al carosello (sfondo sfumato + foto +
// didascalia) — condivisa da render offline (canvas) e anteprima live (DOM). La mappa NON viene
// ritagliata a questa zona: il carosello vi si sovrappone con uno sfondo sfumato invece che pieno,
// così il percorso resta visibile in trasparenza sotto le foto.
export const CAROUSEL_BAND_FRACTION = 0.34

// Frazione dell'altezza riservata in alto a grafici/testo (titolo, statistiche, barra di
// avanzamento, profilo altimetrico, grafici FC/velocità) — tra questa fascia e il carosello la
// mappa resta completamente pulita, senza alcun testo o grafico sovrapposto.
export const TOP_BAND_FRACTION = 0.30

// ── Distanza reale lungo il tracciato ──────────────────────────────────────────

/** Distanza cumulata (metri) ad ogni indice del tracciato — indice 0 = 0m. Base per convertire tra
 *  "progresso" (frazione dell'INDICE, non della distanza — un tratto percorso lentamente ha più
 *  punti GPS per metro di uno percorso di corsa) e distanza reale. */
export function buildCumulativeDistances(pts: { lat?: number; lon?: number }[]): Float64Array {
  const N = pts.length
  const cum = new Float64Array(N)
  for (let i = 1; i < N; i++) {
    const a = pts[i - 1], b = pts[i]
    cum[i] = cum[i - 1] + (a.lat != null && a.lon != null && b.lat != null && b.lon != null
      ? haversineM(a.lat, a.lon, b.lat, b.lon) : 0)
  }
  return cum
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Progresso (frazione 0..1 dell'indice) → distanza reale (metri) lungo il tracciato. */
export function progressToDistanceM(progress: number, cumDist: Float64Array): number {
  const N = cumDist.length
  if (N < 2) return 0
  const idx = Math.min(N - 1, Math.max(0, progress * (N - 1)))
  const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, N - 1), t = idx - i0
  return cumDist[i0] + (cumDist[i1] - cumDist[i0]) * t
}

/** Inverso di progressToDistanceM — distanza reale (metri) → progresso (frazione 0..1 dell'indice).
 *  Ricerca lineare: cumDist ha al più poche migliaia di punti, chiamata poche volte per frame. */
export function distanceMToProgress(distanceM: number, cumDist: Float64Array): number {
  const N = cumDist.length
  if (N < 2) return 0
  if (distanceM <= cumDist[0]) return 0
  if (distanceM >= cumDist[N - 1]) return 1
  for (let i = 1; i < N; i++) {
    if (cumDist[i] >= distanceM) {
      const span = cumDist[i] - cumDist[i - 1]
      const t = span > 0 ? (distanceM - cumDist[i - 1]) / span : 0
      return (i - 1 + t) / (N - 1)
    }
  }
  return 1
}

// ── Timeline "viaggio tra una foto e l'altra" ──────────────────────────────────

export interface JourneyTables {
  totalFrames: number
  /** progresso (0..1) per ogni frame del "seguimento" (dopo l'intro, prima del finale). */
  pTable: Float64Array
  /** indice (in sortedPhotos) della foto su cui la telecamera è ferma in quel frame, -1 se in viaggio. */
  stopIndexTable: Int32Array
  /** 0..1: avanzamento all'interno della sosta corrente (0 se in viaggio) — per l'effetto zoom. */
  stopTTable: Float64Array
}

/** Costruisce la timeline "sosta su ogni foto, poi viaggio a ritmo costante verso la successiva" —
 *  usata dal render offline (tabella pre-calcolata, budget di frame esatto) e, con lo stesso
 *  algoritmo applicato in modo incrementale, dall'anteprima live (vedi useCarouselJourneyStep). */
export function buildJourneyTables(
  fps: number, cumDist: Float64Array, totalDistanceM: number,
  sortedPhotos: CarouselPhotoTiming[], stopSeconds: number, cruiseMps: number,
): JourneyTables {
  const stopFrames = Math.max(1, Math.round(fps * stopSeconds))
  const safeCruise = Math.max(0.2, cruiseMps)

  interface Seg { kind: 'travel' | 'stop'; frames: number; fromP: number; toP: number; photoIdx: number }
  const segs: Seg[] = []
  let prevP = 0, prevD = 0
  sortedPhotos.forEach((ph, i) => {
    const travelD = Math.max(0, ph.distanceM - prevD)
    segs.push({ kind: 'travel', frames: Math.max(1, Math.round(fps * travelD / safeCruise)), fromP: prevP, toP: ph.progress, photoIdx: -1 })
    segs.push({ kind: 'stop', frames: stopFrames, fromP: ph.progress, toP: ph.progress, photoIdx: i })
    prevP = ph.progress; prevD = ph.distanceM
  })
  const finalD = Math.max(0, totalDistanceM - prevD)
  segs.push({ kind: 'travel', frames: Math.max(1, Math.round(fps * finalD / safeCruise)), fromP: prevP, toP: 1, photoIdx: -1 })

  const totalFrames = segs.reduce((s, seg) => s + seg.frames, 0)
  const pTable = new Float64Array(totalFrames)
  const stopIndexTable = new Int32Array(totalFrames)
  const stopTTable = new Float64Array(totalFrames)

  let f = 0
  for (const seg of segs) {
    for (let i = 0; i < seg.frames; i++) {
      const t = seg.frames > 1 ? i / (seg.frames - 1) : 1
      pTable[f] = seg.fromP + (seg.toP - seg.fromP) * t
      stopIndexTable[f] = seg.kind === 'stop' ? seg.photoIdx : -1
      stopTTable[f] = seg.kind === 'stop' ? t : 0
      f++
    }
  }
  return { totalFrames, pTable, stopIndexTable, stopTTable }
}

// ── Posizione nel carosello (indice frazionario + spaziatura proporzionale) ────

/** Posizione continua (indice frazionario) tra le foto ordinate — es. 1.35 = "un terzo della
 *  strada tra la foto 1 e la foto 2", secondo il PROGRESSO corrente (che durante il viaggio si
 *  muove a ritmo costante rispetto alla distanza reale — vedi buildJourneyTables — quindi anche
 *  questo indice frazionario avanza a ritmo costante, non a scatti). */
export function virtualPhotoIndexAt(progress: number, sortedPhotos: CarouselPhotoTiming[]): number {
  const n = sortedPhotos.length
  if (n === 0) return -1
  if (n === 1) return 0
  if (progress <= sortedPhotos[0].progress) return 0
  if (progress >= sortedPhotos[n - 1].progress) return n - 1
  for (let i = 0; i < n - 1; i++) {
    const a = sortedPhotos[i], b = sortedPhotos[i + 1]
    if (progress >= a.progress && progress <= b.progress) {
      const span = b.progress - a.progress
      const t = span > 0 ? (progress - a.progress) / span : 0
      return i + t
    }
  }
  return n - 1
}

const MIN_SLOT_UNITS = 1
const MAX_SLOT_UNITS = 3.2  // tetto: una foto isolata molto lontana dalle altre non spinge le sue vicine fuori schermo

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Posizione di ogni foto nel carosello, in "unità" (1 unità = spaziatura minima/di base) —
 *  proporzionale alla distanza reale tra foto consecutive, con un minimo garantito così due foto
 *  scattate a pochi metri di distanza restano comunque leggibili invece di sovrapporsi. */
export function buildStripOffsets(sortedPhotos: CarouselPhotoTiming[]): number[] {
  if (sortedPhotos.length === 0) return []
  const offsets = [0]
  const gaps: number[] = []
  for (let i = 1; i < sortedPhotos.length; i++) gaps.push(sortedPhotos[i].distanceM - sortedPhotos[i - 1].distanceM)
  const refGap = gaps.length ? median(gaps) : 1
  for (let i = 1; i < sortedPhotos.length; i++) {
    const d = sortedPhotos[i].distanceM - sortedPhotos[i - 1].distanceM
    const units = refGap > 0 ? Math.min(MAX_SLOT_UNITS, Math.max(MIN_SLOT_UNITS, d / refGap)) : MIN_SLOT_UNITS
    offsets.push(offsets[i - 1] + units)
  }
  return offsets
}

/** Posizione di scorrimento continua (in unità, vedi buildStripOffsets) per un `virtualIndex`
 *  frazionario — interpola tra le posizioni-unità delle due foto adiacenti. */
export function stripOffsetAt(virtualIndex: number, offsets: number[]): number {
  const n = offsets.length
  if (n === 0) return 0
  if (virtualIndex <= 0) return offsets[0]
  if (virtualIndex >= n - 1) return offsets[n - 1]
  const i0 = Math.floor(virtualIndex), i1 = Math.min(i0 + 1, n - 1), t = virtualIndex - i0
  return offsets[i0] + (offsets[i1] - offsets[i0]) * t
}
