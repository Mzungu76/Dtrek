// Timing/posizionamento condivisi dal carosello foto in basso dello stile video "Carosello" (vedi
// RouteMap3D.tsx) — un'unica fonte usata sia dal render offline (export via canvas/WebCodecs) sia
// dall'anteprima interattiva (overlay DOM), così l'anteprima mostra esattamente quello che il video
// esportato otterrà. A differenza dello stile "Classico" (la telecamera si ferma e la foto copre
// tutto lo schermo), qui la traccia resta sempre visibile e in movimento: la telecamera rallenta
// avvicinandosi a ogni foto — mai fino a fermarsi — invece di congelarsi.

export interface CarouselPhotoTiming { id: string; progress: number }

// Frazione dell'altezza dello schermo riservata in basso al carosello (sfondo sfumato + foto +
// didascalia) — condivisa da render offline (canvas) e anteprima live (DOM). La mappa NON viene
// ritagliata a questa zona: resta a schermo intero, il carosello vi si sovrappone con uno sfondo
// sfumato invece che pieno, così il percorso resta visibile in trasparenza sotto le foto.
export const CAROUSEL_BAND_FRACTION = 0.34

// Quanto (in frazione di progresso 0..1 del percorso) la telecamera rallenta avvicinandosi a una
// foto, e per quanto resta "in primo piano" nel carosello — stessa manopola per entrambi gli
// effetti: rallentare più a lungo vicino a una foto la mantiene anche più a lungo al centro della
// striscia, senza bisogno di due parametri separati da tenere sincronizzati.
const HIGHLIGHT_WINDOW = 0.075
// La telecamera non deve mai fermarsi (richiesta esplicita) — ma vicino a una foto rallenta molto,
// quasi a fermarsi (12% della velocità di crociera), per dare tempo di guardarla.
const MIN_SPEED_FACTOR = 0.12

function windowFactor(progress: number, photoProgress: number): number {
  const d = Math.abs(progress - photoProgress)
  if (d >= HIGHLIGHT_WINDOW) return 1
  const t = d / HIGHLIGHT_WINDOW
  // Smoothstep (t²(3-2t)), non un ease coseno: la derivata è zero a ENTRAMBI gli estremi (t=0,
  // il punto più lento, e t=1, dove si ricongiunge alla velocità di crociera). Con l'ease coseno
  // usato prima, la derivata a t=1 non era zero — un salto di accelerazione della telecamera
  // esattamente al bordo della finestra, ripetuto una volta per foto, visibile come sfarfallio nel
  // video (la fluidità della camera dipende dalla derivata del progresso, non solo dal suo valore).
  return MIN_SPEED_FACTOR + (1 - MIN_SPEED_FACTOR) * (t * t * (3 - 2 * t))
}

/** Fattore di velocità 0..1 della telecamera nel punto `progress` del percorso — 1 = velocità di
 *  crociera, scende (mai a zero) quando `progress` è vicino alla posizione di una foto. */
export function speedFactorAt(progress: number, photos: CarouselPhotoTiming[]): number {
  let factor = 1
  for (const ph of photos) factor = Math.min(factor, windowFactor(progress, ph.progress))
  return factor
}

/** Tabella pre-calcolata frame→progresso "deformato": stesso traguardo finale (progresso 1
 *  all'ultimo frame) del semplice frame/totalFrames lineare, ma con velocità locale ridotta
 *  vicino a ogni foto — usata dal render offline, dove serve un budget di frame esatto e
 *  ripetibile invece dell'integrazione incrementale usata dall'anteprima live (vedi speedFactorAt). */
export function buildWarpedProgressTable(totalFrames: number, photos: CarouselPhotoTiming[]): Float64Array {
  const table = new Float64Array(Math.max(0, totalFrames))
  if (totalFrames <= 1) { if (totalFrames === 1) table[0] = 1; return table }
  const speeds = new Float64Array(totalFrames)
  let sum = 0
  for (let f = 0; f < totalFrames; f++) {
    const rawP = f / (totalFrames - 1)
    speeds[f] = speedFactorAt(rawP, photos)
    sum += speeds[f]
  }
  let cum = 0
  for (let f = 0; f < totalFrames; f++) { cum += speeds[f]; table[f] = cum / sum }
  return table
}

/** Posizione continua (indice frazionario) tra le foto ordinate per progresso — es. 1.35 = "un
 *  terzo della strada tra la foto 1 e la foto 2". Guida sia lo scorrimento del carosello sia quale
 *  foto è "corrente" (round(virtualIndex)) in entrambe le viste (canvas export, overlay DOM). */
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
