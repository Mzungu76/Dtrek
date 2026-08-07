// Preparazione delle immagini per la cattura DOM → PDF.
//
// Due problemi ricorrenti che questo modulo risolve una volta per tutte:
//
// 1. html2canvas NON implementa `object-fit`. Un `<img style="object-fit:cover">` viene disegnato
//    stirato per riempire il box, quindi ogni foto verticale in un riquadro orizzontale esce
//    schiacciata. Il codice lo sapeva già (vedi il commento in utils/pdfExport/mapTiles.ts:41),
//    ma la soluzione era stata applicata solo alla copertina della guida.
//
// 2. `nextLayout()` garantisce che il layout sia calcolato, non che le immagini siano decodificate.
//    Misurare l'altezza di un elemento prima che le sue immagini abbiano dimensioni intrinseche
//    produce punti di interruzione pagina sbagliati e contenuto che scivola fuori pagina.

import { aspectFitCrop } from './videoOverlays'

/**
 * Attende che ogni <img> dentro `root` sia caricata (o fallita).
 *
 * Estratto da app/lib/guide/usePDFExport.ts, che era l'unico dei tre percorsi PDF a farlo
 * correttamente: Diario e Resoconto misuravano e catturavano senza aspettare nulla.
 *
 * Le immagini in errore risolvono comunque: una foto mancante è meglio di una generazione
 * bloccata a tempo indeterminato. Il timeout copre il caso di una richiesta appesa, che senza
 * di esso lascerebbe la Promise irrisolta per sempre.
 */
export function waitForImages(root: HTMLElement, timeoutMs = 20_000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
  if (imgs.length === 0) return Promise.resolve()

  const all = Promise.all(
    imgs.map(img => new Promise<void>(resolve => {
      if (img.complete && img.naturalWidth > 0) { resolve(); return }
      img.addEventListener('load',  () => resolve(), { once: true })
      img.addEventListener('error', () => resolve(), { once: true })
    })),
  ).then(() => undefined)

  const timeout = new Promise<void>(resolve => setTimeout(resolve, timeoutMs))
  return Promise.race([all, timeout])
}

/** Carica un'immagine, chiedendo il CORS quando è di un'altra origine.
 *
 *  `crossOrigin='anonymous'` è obbligatorio per le foto su Supabase Storage: senza, il canvas
 *  che le disegna resta "sporco" e `toDataURL()` lancia SecurityError. Non va invece impostato
 *  sulle risorse same-origin (compreso il proxy /api/tile), perché una risposta già in cache
 *  senza header CORS farebbe fallire il caricamento. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const sameOrigin = src.startsWith('/') || src.startsWith('data:') || src.startsWith('blob:')
      || (typeof location !== 'undefined' && src.startsWith(location.origin))
    if (!sameOrigin) img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error(`Immagine non caricata: ${src.slice(0, 120)}`))
    img.src = src
  })
}

/**
 * Ritaglia un'immagine al rapporto d'aspetto richiesto e la restituisce come data URL, cioè fa
 * a monte quello che `object-fit: cover` farebbe a valle — con la differenza che questo il PDF
 * lo rispetta.
 *
 * `maxWidth` limita il risultato: le foto da smartphone sono spesso 4000px di lato, e incorporarle
 * a piena risoluzione in un PDF che poi le mostra a 250px produce file da decine di megabyte.
 */
export async function cropToAspect(
  src: string,
  aspect: number,
  maxWidth = 1600,
  quality = 0.9,
): Promise<string> {
  const img = await loadImage(src)
  const { sx, sy, sw, sh } = aspectFitCrop(img.naturalWidth, img.naturalHeight, aspect)

  const outW = Math.min(sw, maxWidth)
  const outH = Math.round(outW / aspect)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)

  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Sostituisce in blocco gli `<img>` con `object-fit` dentro `root` con la versione pre-ritagliata,
 * usando il rapporto d'aspetto che il box ha realmente a schermo.
 *
 * Va chiamata sul clone destinato alla cattura, mai sul DOM vivo: modifica i `src`.
 * Le immagini che non si caricano restano com'erano — meglio una foto stirata che nessuna foto.
 */
export async function flattenObjectFit(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'))
    .filter(img => {
      const fit = getComputedStyle(img).objectFit
      return fit === 'cover' || fit === 'contain'
    })

  await Promise.all(imgs.map(async img => {
    const rect = img.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    try {
      img.src = await cropToAspect(img.src, rect.width / rect.height)
      img.style.objectFit = 'fill' // ora il ritaglio è nel file: riempire il box è corretto
    } catch { /* immagine non accessibile: si tiene l'originale */ }
  }))
}
