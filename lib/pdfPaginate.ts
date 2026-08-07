// Impaginazione deterministica HTML → PDF.
//
// html2pdf.js rende tutto in un unico canvas altissimo e lo taglia a intervalli fissi, il che
// spezza foto e sezioni a metà ed emette pagine bianche. Questo modulo misura invece il layout
// reale e taglia SOLO ai confini sicuri (gli elementi marcati `.pdf-block`), così la paginazione
// segue quella che si vede a schermo.
//
// Rispetto alla prima versione sono cambiate quattro cose, tutte per difetti osservati sui PDF
// prodotti:
//
//  1. CATTURA A BLOCCHI. Prima si catturava l'intero elemento in un canvas solo. Un resoconto di
//     otto pagine è alto ~9000px CSS: a scale 2 diventa un canvas da oltre 28 Mpx, sopra il limite
//     di area di Safari su iOS (~16,7 Mpx). Oltre quel limite il canvas torna VUOTO senza sollevare
//     eccezioni, quindi il PDF usciva bianco su iPhone senza alcun errore. Ora si cattura una
//     banda alla volta, con l'area tenuta sotto MAX_CANVAS_PX.
//
//  2. TESTATINE E NUMERI DI PAGINA DISEGNATI CON jsPDF, non iniettati nel DOM. Prima erano
//     `position:absolute` rispetto all'ELEMENTO (alto migliaia di px), non alla pagina A4: finivano
//     solo nella prima e nell'ultima fetta, e le pagine intermedie restavano senza nulla. Disegnarli
//     alla fine, ciclando sulle pagine fisiche, li mette su tutte — e li rende vettoriali e
//     selezionabili invece che rasterizzati.
//
//  3. NUMERAZIONE CORRETTA. Prima era `${pageIndex+1} / ${elements.length}`: contava gli ELEMENTI
//     sorgente, non le pagine prodotte. Un elemento può generarne tre o quattro, quindi i numeri
//     erano sistematicamente sbagliati; e il resoconto, che passa un elemento solo, riportava
//     "1 / 1" su tutto il documento.
//
//  4. SPAZIO RISERVATO. La fascia di testa e quella di piede hanno ora un'altezza sottratta
//     all'area di contenuto, invece di essere sovrapposte al testo con `z-index:50`.

import { waitForImages, flattenObjectFit } from './pdfImages'

const PAGE_W = 794   // A4 @ 96dpi (px)
const PAGE_H = 1123

const HEADER_H = 30
const FOOTER_H = 26
const CONTENT_H = PAGE_H - HEADER_H - FOOTER_H

/** Tetto all'area di un singolo canvas, con margine sotto il limite iOS (~16,7 Mpx). */
const MAX_CANVAS_PX = 12_000_000

export interface PaginateOptions {
  /** Titolo mostrato in testata a destra. `diaryTitle` resta come alias storico. */
  documentTitle?: string
  diaryTitle?: string
  authorName?: string
  /** Elementi da impaginare a pagina piena, senza testatina né piede: copertine e simili. */
  bleedSelector?: string
  /** Avanzamento sulle pagine fisiche, per una barra di progresso. */
  onProgress?: (done: number, total: number) => void
  /** Fattore di sovracampionamento della cattura. 2 ≈ 192 dpi. */
  scale?: number
}

/**
 * jsPDF con i font di base codifica il testo in WinAnsi (CP1252). I caratteri fuori da quel
 * repertorio non vengono resi.
 *
 * Esportata perché è la stessa usata da `utils/pdfExport/docHelpers.ts` (i template jsPDF
 * superstiti di Statistiche e Mappa): prima quel file aveva una propria `safeText` che tagliava
 * tutto ciò che sta fuori da Latin-1, cancellando in silenzio trattini lunghi, virgolette curve e
 * puntini di sospensione. Qui si conserva anche la fascia alta di CP1252, dove quei segni stanno.
 * Cadono solo emoji e alfabeti non latini, che davvero non sono rappresentabili.
 */
const CP1252_HIGH = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
export function pdfSafe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x20-\xFF]/g, c => (CP1252_HIGH.includes(c) ? c : '')).trim()
}

/** Punti di taglio sicuri dentro `el`, in px CSS relativi al suo bordo superiore. */
function safeBreaks(el: HTMLElement, softBreakSelector: string, totalH: number): number[] {
  const elTop = el.getBoundingClientRect().top
  const breaks = new Set<number>([0, totalH])
  el.querySelectorAll<HTMLElement>(softBreakSelector).forEach(b => {
    const bottom = Math.round(b.getBoundingClientRect().bottom - elTop)
    if (bottom > 0 && bottom < totalH) breaks.add(bottom)
  })
  return Array.from(breaks).sort((a, b) => a - b)
}

/**
 * Divide l'altezza di un elemento in fette non più alte di `availH`, agganciandosi al punto di
 * taglio sicuro più basso che entra nella pagina. Se un singolo blocco è più alto di una pagina
 * intera non c'è alternativa al taglio forzato: è il segnale che quel blocco va spezzato in
 * `.pdf-block` più piccoli nel template.
 */
function sliceHeights(breaks: number[], totalH: number, availH: number): { top: number; height: number }[] {
  const slices: { top: number; height: number }[] = []
  let start = 0
  while (start < totalH - 1) {
    const ideal = start + availH
    let end: number
    if (ideal >= totalH) {
      end = totalH
    } else {
      const fitting = breaks.filter(y => y > start && y <= ideal)
      end = fitting.length ? fitting[fitting.length - 1] : ideal
    }
    slices.push({ top: start, height: end - start })
    start = end
  }
  return slices
}

/**
 * Rende gli elementi indicati in un unico PDF.
 *
 * Ogni elemento comincia su una pagina nuova. Al suo interno le interruzioni cadono sul bordo
 * inferiore dei discendenti `.pdf-block`, così un blocco non viene mai spezzato tra due pagine.
 *
 * Gli elementi devono già essere nel documento (per esempio dentro un contenitore fuori schermo),
 * altrimenti il loro layout — e quello dei loro `.pdf-block` — non è calcolato.
 */
export async function paginateToPdf(
  elements: HTMLElement[],
  softBreakSelector = '.pdf-block',
  options?: PaginateOptions,
): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const scale = options?.scale ?? 2
  const bleedSelector = options?.bleedSelector ?? '.pdf-bleed'
  const title = options?.documentTitle ?? options?.diaryTitle ?? ''

  // Le immagini devono essere decodificate PRIMA di misurare: `nextLayout()` garantisce il layout,
  // non il decode, e un'immagine ancora senza dimensioni intrinseche falsa l'altezza dell'elemento
  // e quindi tutti i punti di interruzione calcolati sotto.
  await Promise.all(elements.map(el => waitForImages(el)))

  // html2canvas non implementa `object-fit`: disegna l'immagine stirata per riempire il box, quindi
  // ogni foto verticale in un riquadro orizzontale esce schiacciata. Qui si esegue il ritaglio a
  // monte, una volta per tutti i documenti, invece di lasciarlo a ciascun template.
  //
  // Gli elementi passati sono sempre cloni o contenitori usa e getta, quindi modificarne i `src`
  // non tocca ciò che l'utente vede a schermo.
  await Promise.all(elements.map(el => flattenObjectFit(el)))
  // Il ritaglio riscrive le `src` con dei data URL, quindi le immagini ricominciano a caricarsi:
  // serve una seconda attesa prima di misurare, altrimenti si torna al problema di partenza.
  await Promise.all(elements.map(el => waitForImages(el)))

  const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait' })

  // ── Passo 1: pianificare tutte le pagine fisiche, prima di catturare qualsiasi cosa ──────────
  interface PlannedPage { el: HTMLElement; top: number; height: number; bleed: boolean }
  const plan: PlannedPage[] = []

  for (const el of elements) {
    const totalH = el.scrollHeight
    if (totalH < 1) continue
    const bleed = el.matches(bleedSelector)
    const availH = bleed ? PAGE_H : CONTENT_H
    const breaks = safeBreaks(el, softBreakSelector, totalH)
    for (const s of sliceHeights(breaks, totalH, availH)) {
      plan.push({ el, top: s.top, height: s.height, bleed })
    }
  }

  if (plan.length === 0) return pdf.output('blob')

  // ── Passo 2: catturare a blocchi, così nessun canvas supera MAX_CANVAS_PX ────────────────────
  // Si raggruppano pagine consecutive dello stesso elemento finché l'area resta nel budget: una
  // chiamata a html2canvas costa un clone completo del documento, quindi conviene ammortizzarla su
  // più pagine invece di pagarla una volta per pagina.
  const maxChunkH = Math.floor(MAX_CANVAS_PX / (PAGE_W * scale * scale))

  let pageNo = 0
  let i = 0
  while (i < plan.length) {
    const el = plan[i].el
    const chunkTop = plan[i].top
    let j = i
    let chunkH = 0
    while (
      j < plan.length &&
      plan[j].el === el &&
      (chunkH === 0 || chunkH + plan[j].height <= maxChunkH)
    ) {
      chunkH += plan[j].height
      j++
    }

    const chunk = await html2canvas(el, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
      // x/y sono offset relativi all'elemento (html2canvas li somma ai suoi bounds), quindi questa
      // è esattamente la banda voluta e il canvas prodotto ha la dimensione del solo ritaglio.
      x: 0,
      y: chunkTop,
      width: PAGE_W,
      height: chunkH,
    })

    // ── Passo 3: dal canvas del blocco, ritagliare le singole pagine ──────────────────────────
    let offsetInChunk = 0
    for (let k = i; k < j; k++) {
      const p = plan[k]
      const sy = Math.round(offsetInChunk * scale)
      const sh = Math.max(1, Math.round(p.height * scale))

      const slice = document.createElement('canvas')
      slice.width = chunk.width
      slice.height = sh
      const sctx = slice.getContext('2d')!
      sctx.fillStyle = '#ffffff'
      sctx.fillRect(0, 0, slice.width, slice.height)
      sctx.drawImage(chunk, 0, sy, chunk.width, sh, 0, 0, chunk.width, sh)

      const imgData = slice.toDataURL('image/jpeg', 0.92)
      if (pageNo > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait')
      pdf.addImage(imgData, 'JPEG', 0, p.bleed ? 0 : HEADER_H, PAGE_W, p.height)

      // Libera subito il buffer della fetta: su documenti lunghi il picco di memoria conta.
      slice.width = 0; slice.height = 0

      pageNo++
      options?.onProgress?.(pageNo, plan.length)
      offsetInChunk += p.height
    }

    chunk.width = 0; chunk.height = 0
    i = j
  }

  // ── Passo 4: testatina e piede su ogni pagina FISICA ─────────────────────────────────────────
  // Stessa tecnica di utils/pdfExport/docHelpers.ts: si ripassano le pagine alla fine, quando il
  // totale è finalmente noto. Il testo resta vettoriale e selezionabile.
  //
  // I font del brand non sono incorporati nel documento, quindi qui si usa Helvetica di jsPDF: è
  // una scelta consapevole limitata a numero di pagina e testatina. Incorporare Barlow Condensed
  // richiede il font in base64 e riguarda il rifacimento dei template.
  const total = pdf.getNumberOfPages()
  const safeTitle = pdfSafe(title)
  const safeAuthor = pdfSafe(options?.authorName ?? '')

  for (let n = 1; n <= total; n++) {
    if (plan[n - 1]?.bleed) continue // le pagine al vivo restano pulite
    pdf.setPage(n)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(169, 161, 142) // stone-400

    if (safeTitle) {
      pdf.setFontSize(7)
      pdf.text('DTrek', 32, HEADER_H - 10)
      pdf.text(safeTitle, PAGE_W - 32, HEADER_H - 10, { align: 'right' })
    }

    pdf.setFontSize(8)
    pdf.text(`${n} / ${total}`, PAGE_W / 2, PAGE_H - 10, { align: 'center' })
    if (safeAuthor) {
      pdf.setFontSize(7)
      pdf.text(safeAuthor, 32, PAGE_H - 10)
    }
  }

  return pdf.output('blob')
}

/**
 * Due frame di animazione: garantisce che il layout sia stato calcolato prima di misurarlo.
 *
 * Attenzione: garantisce il LAYOUT, non il caricamento delle immagini — per quello serve
 * `waitForImages` (lib/pdfImages.ts), che `paginateToPdf` chiama già da sé.
 *
 * Il fallback a `setTimeout` copre le schede in secondo piano, dove `requestAnimationFrame` viene
 * limitato quasi a zero: senza, cambiare scheda durante una pubblicazione lunga congelava la
 * generazione a tempo indeterminato e senza errore.
 */
export function nextLayout(): Promise<void> {
  return new Promise(resolve => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    setTimeout(finish, 300)
  })
}
