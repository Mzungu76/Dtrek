// Timing/posizionamento condivisi dal video in stile "Carosello" (vedi RouteMap3D.tsx) — un'unica
// fonte usata sia dal render offline (export via canvas/WebCodecs) sia dall'anteprima interattiva,
// così l'anteprima mostra esattamente quello che il video esportato otterrà.
//
// Modello "viaggio tra una foto e l'altra": la telecamera SI FERMA davvero su ogni foto (non un
// semplice rallentamento) per il tempo di visione — mentre è ferma, il pin della foto (già
// presente sul percorso) si apre in una polaroid ben visibile, poi torna piccolo — poi viaggia
// verso la foto successiva a un ritmo costante proporzionale alla distanza REALE (non alla
// frazione di progresso, che con punti GPS diradati in alcuni tratti non è proporzionale alla
// distanza vera). La durata del video è una conseguenza di questo ritmo, non un traguardo fisso.

export interface CarouselPhotoTiming { id: string; progress: number; distanceM: number }

/** Foto scattate a poca distanza l'una dall'altra, mostrate in un'unica sosta. */
export interface PhotoGroup { ids: string[]; progress: number; distanceM: number }

/**
 * Raggruppa le foto separate da meno di `minGapM` metri di percorso.
 *
 * Chi carica dieci foto dello stesso punto panoramico si ritroverebbe altrimenti dieci soste di
 * fila: il video si spezzetta e il ritmo sparisce. Foto scattate a pochi metri l'una dall'altra
 * sono lo stesso momento, e vanno mostrate insieme (come polaroid posate sul tavolo) invece che in
 * sequenza. La sosta del gruppo si colloca alla distanza MEDIA delle sue foto, così resta dov'era
 * il momento e non salta alla prima o all'ultima.
 */
export function groupPhotoTimings(photos: CarouselPhotoTiming[], minGapM: number): PhotoGroup[] {
  if (photos.length === 0) return []
  const sorted = [...photos].sort((a, b) => a.distanceM - b.distanceM)
  const groups: CarouselPhotoTiming[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const last = groups[groups.length - 1]
    // Confronto con l'ULTIMA del gruppo, non con la prima: una fila di foto distanziate ognuna
    // meno del minimo è comunque un'unica sequenza continua, e va tenuta insieme.
    if (sorted[i].distanceM - last[last.length - 1].distanceM <= minGapM) last.push(sorted[i])
    else groups.push([sorted[i]])
  }
  return groups.map(g => ({
    ids: g.map(x => x.id),
    progress: g.reduce((a, x) => a + x.progress, 0) / g.length,
    distanceM: g.reduce((a, x) => a + x.distanceM, 0) / g.length,
  }))
}

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

/** Un tratto di viaggio (non di sosta) della timeline — usato per l'effetto "hyperlapse"
 *  opzionale (vedi hyperlapseIntensityAt) sui tratti più lunghi. */
export interface TravelSegmentMeta { startFrame: number; endFrame: number; distanceM: number }

export interface JourneyTables {
  totalFrames: number
  /** progresso (0..1) per ogni frame del "seguimento" (dopo l'intro, prima del finale). */
  pTable: Float64Array
  /** indice (in sortedPhotos) della foto su cui la telecamera è ferma in quel frame, -1 se in viaggio. */
  stopIndexTable: Int32Array
  /** 0..1: avanzamento all'interno della sosta corrente (0 se in viaggio) — per l'effetto zoom. */
  stopTTable: Float64Array
  /** Tratti di viaggio (non le soste), con la loro distanza reale — vedi TravelSegmentMeta. */
  travelSegments: TravelSegmentMeta[]
}

/** Costruisce la timeline "sosta su ogni foto, poi viaggio a ritmo costante verso la successiva" —
 *  usata dal render offline (tabella pre-calcolata, budget di frame esatto) e, con lo stesso
 *  algoritmo applicato in modo incrementale, dall'anteprima live (vedi tick() in RouteMap3D). */
export function buildJourneyTables(
  fps: number, cumDist: Float64Array, totalDistanceM: number,
  sortedPhotos: { progress: number; distanceM: number }[], stopSeconds: number, cruiseMps: number,
): JourneyTables {
  const stopFrames = Math.max(1, Math.round(fps * stopSeconds))
  const safeCruise = Math.max(0.2, cruiseMps)

  interface Seg { kind: 'travel' | 'stop'; frames: number; fromP: number; toP: number; photoIdx: number; distanceM: number }
  const segs: Seg[] = []
  let prevP = 0, prevD = 0
  sortedPhotos.forEach((ph, i) => {
    const travelD = Math.max(0, ph.distanceM - prevD)
    segs.push({ kind: 'travel', frames: Math.max(1, Math.round(fps * travelD / safeCruise)), fromP: prevP, toP: ph.progress, photoIdx: -1, distanceM: travelD })
    segs.push({ kind: 'stop', frames: stopFrames, fromP: ph.progress, toP: ph.progress, photoIdx: i, distanceM: 0 })
    prevP = ph.progress; prevD = ph.distanceM
  })
  const finalD = Math.max(0, totalDistanceM - prevD)
  segs.push({ kind: 'travel', frames: Math.max(1, Math.round(fps * finalD / safeCruise)), fromP: prevP, toP: 1, photoIdx: -1, distanceM: finalD })

  const totalFrames = segs.reduce((s, seg) => s + seg.frames, 0)
  const pTable = new Float64Array(totalFrames)
  const stopIndexTable = new Int32Array(totalFrames)
  const stopTTable = new Float64Array(totalFrames)
  const travelSegments: TravelSegmentMeta[] = []

  let f = 0
  for (const seg of segs) {
    if (seg.kind === 'travel') travelSegments.push({ startFrame: f, endFrame: f + seg.frames, distanceM: seg.distanceM })
    for (let i = 0; i < seg.frames; i++) {
      const t = seg.frames > 1 ? i / (seg.frames - 1) : 1
      pTable[f] = seg.fromP + (seg.toP - seg.fromP) * t
      stopIndexTable[f] = seg.kind === 'stop' ? seg.photoIdx : -1
      stopTTable[f] = seg.kind === 'stop' ? t : 0
      f++
    }
  }
  return { totalFrames, pTable, stopIndexTable, stopTTable, travelSegments }
}

// ── Hyperlapse opzionale sui tratti di viaggio più lunghi ───────────────────────

// Sotto questa distanza un tratto non è "lungo" abbastanza da giustificare l'effetto — tratti
// brevi tra foto ravvicinate restano puliti, l'energia in più si nota solo dove il viaggio dura
// davvero (Sezione 4, effetto opzionale attivabile dall'utente).
const HYPERLAPSE_MIN_DISTANCE_M = 400

function bumpEnvelope(localT: number): number {
  const c = Math.min(1, Math.max(0, localT))
  const half = c < 0.5 ? c * 2 : (1 - c) * 2
  return half * half * (3 - 2 * half)  // smoothstep: deriva nulla ad entrambi gli estremi (0 e 1)
}

/** Intensità 0..1 dell'effetto hyperlapse nel frame `followFrame` — 0 fuori dai tratti di viaggio
 *  "lunghi" (sotto HYPERLAPSE_MIN_DISTANCE_M) e durante le soste, un rigonfiamento morbido (0 ai
 *  bordi del tratto, 1 al centro) altrove — così l'effetto sfuma dentro/fuori invece di comparire
 *  di scatto all'inizio/fine del tratto. */
export function hyperlapseIntensityAt(followFrame: number, travelSegments: TravelSegmentMeta[]): number {
  for (const seg of travelSegments) {
    if (followFrame >= seg.startFrame && followFrame < seg.endFrame) {
      if (seg.distanceM < HYPERLAPSE_MIN_DISTANCE_M) return 0
      const span = seg.endFrame - seg.startFrame
      const localT = span > 1 ? (followFrame - seg.startFrame) / (span - 1) : 0
      return bumpEnvelope(localT)
    }
  }
  return 0
}

// ── Zoom sulla foto durante la sosta ────────────────────────────────────────────

// Frazione della sosta dedicata rispettivamente ad aprire e chiudere la foto — nel mezzo resta a
// schermo pieno (con un leggero respiro, non un fermo immagine assoluto — vedi RouteMap3D).
// Apertura più lenta e chiusura più rapida (non simmetriche): un elemento che entra in scena con
// più calma di quanto ne esca è un principio di motion design comune alle interfacce più curate
// (es. le linee guida Material Design lo raccomandano esplicitamente).
const PHOTO_ZOOM_GROW_FRAC = 0.27
const PHOTO_ZOOM_SHRINK_FRAC = 0.17

/** Ease-out-"back": supera leggermente il traguardo (1) e torna indietro, invece di fermarsi di
 *  scatto — lo stesso "rimbalzo" morbido usato dalle transizioni di apertura nelle app più curate
 *  (fogli modali iOS, anteprime Google Foto). `overshoot` più basso del classico 1.70158 di
 *  Penner: qui deve restare un accenno elegante, non un rimbalzo vistoso. Raggiunge esattamente 0
 *  a t=0 e 1 a t=1, con derivata nulla a t=1 — si aggancia senza scatti al plateau successivo. */
function easeOutBack(t: number): number {
  const c1 = 1.15, c3 = c1 + 1
  const p = t - 1
  return 1 + c3 * p ** 3 + c1 * p ** 2
}

/** Ease-in parabolico: parte con derivata nulla (aggancio morbido dal plateau) e accelera verso la
 *  chiusura — una richiusura che parte piano e si fa via via più rapida, non lineare. */
function easeInQuad(u: number): number {
  return 1 - u * u
}

/** Quanto è "aperta" la foto (0 = piccola come il pin sul percorso, 1 = polaroid ben visibile, con
 *  un bordo sempre presente attorno — mai a schermo intero, per non sembrare un errore di crop) nel
 *  punto `stopT` (0..1) della sosta corrente — apre (con un leggero superamento elegante), resta
 *  aperta, richiude (accelerando). Entrambi i tratti si agganciano al plateau con derivata nulla,
 *  così l'apertura e la chiusura sono sempre un movimento continuo, mai un salto. */
export function stopPhotoZoomAt(stopT: number): number {
  const t = Math.min(1, Math.max(0, stopT))
  if (t < PHOTO_ZOOM_GROW_FRAC) return easeOutBack(t / PHOTO_ZOOM_GROW_FRAC)
  const shrinkStart = 1 - PHOTO_ZOOM_SHRINK_FRAC
  if (t > shrinkStart) return easeInQuad((t - shrinkStart) / PHOTO_ZOOM_SHRINK_FRAC)
  return 1
}

// ── Rotazione polaroid ──────────────────────────────────────────────────────────

/** Piccola rotazione fissa (gradi, positiva o negativa) per la foto `photoId` — diversa da foto a
 *  foto ma sempre la stessa per la STESSA foto (hash deterministico dell'id, non Math.random():
 *  altrimenti cambierebbe ad ogni chiamata/frame invece di restare fissa per tutta la sosta), per
 *  dare varietà senza che nessuna polaroid sia mai perfettamente ortogonale allo schermo. */
export function polaroidRotationDeg(photoId: string, maxDeg = 5): number {
  let h = 0
  for (let i = 0; i < photoId.length; i++) h = (h * 31 + photoId.charCodeAt(i)) | 0
  return ((h % 1000) / 1000) * maxDeg
}
