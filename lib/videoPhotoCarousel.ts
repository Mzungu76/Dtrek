// Timing/posizionamento condivisi dal video in stile "Carosello" (vedi RouteMap3D.tsx) — un'unica
// fonte usata sia dal render offline (export via canvas/WebCodecs) sia dall'anteprima interattiva,
// così l'anteprima mostra esattamente quello che il video esportato otterrà.
//
// Modello "viaggio tra una foto e l'altra": la telecamera SI FERMA davvero su ogni foto (non un
// semplice rallentamento) per il tempo di visione — mentre è ferma, il pin della foto (già
// presente sul percorso) si ingrandisce fino a quasi coprire lo schermo, poi torna piccolo — poi
// viaggia verso la foto successiva a un ritmo costante proporzionale alla distanza REALE (non alla
// frazione di progresso, che con punti GPS diradati in alcuni tratti non è proporzionale alla
// distanza vera). La durata del video è una conseguenza di questo ritmo, non un traguardo fisso.

export interface CarouselPhotoTiming { id: string; progress: number; distanceM: number }

// Frazione dell'altezza riservata in alto a grafici/testo (titolo, statistiche, barra di
// avanzamento, profilo altimetrico, grafici FC/velocità) — sovrapposta alla mappa con una leggera
// trasparenza, non una fascia dedicata separata: la mappa resta a schermo intero.
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
 *  algoritmo applicato in modo incrementale, dall'anteprima live (vedi tick() in RouteMap3D). */
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

// ── Zoom sulla foto durante la sosta ────────────────────────────────────────────

// Frazione della sosta dedicata rispettivamente ad aprire e chiudere la foto — nel mezzo resta a
// schermo pieno (con un leggero respiro, non un fermo immagine assoluto — vedi RouteMap3D).
const PHOTO_ZOOM_GROW_FRAC = 0.24
const PHOTO_ZOOM_SHRINK_FRAC = 0.22

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/** Quanto è "aperta" la foto (0 = piccola come il pin sul percorso, 1 = quasi a schermo intero) nel
 *  punto `stopT` (0..1) della sosta corrente — apre, resta aperta, richiude. Smoothstep sui due
 *  tratti (non lineare-poi-piatto): la derivata si annulla dove il ramp si aggancia al plateau, così
 *  l'apertura e la chiusura sono sempre un movimento leggero e continuo, mai un salto. */
export function stopPhotoZoomAt(stopT: number): number {
  const t = Math.min(1, Math.max(0, stopT))
  if (t < PHOTO_ZOOM_GROW_FRAC) return smoothstep(t / PHOTO_ZOOM_GROW_FRAC)
  const shrinkStart = 1 - PHOTO_ZOOM_SHRINK_FRAC
  if (t > shrinkStart) return smoothstep(1 - (t - shrinkStart) / PHOTO_ZOOM_SHRINK_FRAC)
  return 1
}
