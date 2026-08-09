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

import {
  PDF_PAGE_W as PAGE_W, PDF_PAGE_H as PAGE_H,
  PDF_HEADER_H as HEADER_H, PDF_FOOTER_H as FOOTER_H, PDF_CONTENT_H as CONTENT_H,
} from './pdfPageGeometry'

// Ri-esportate per i chiamanti che già impaginano da qui; i *template* devono importarle da
// `lib/pdfPageGeometry.ts`, che non trascina html2canvas/jsPDF nel loro bundle.
export { PDF_PAGE_W, PDF_PAGE_H, PDF_CONTENT_H } from './pdfPageGeometry'

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
  /** Fattore di sovracampionamento della cattura. 1.5 ≈ 144 dpi: nitido su schermo e dignitoso
   *  stampato. A 2 ogni pagina pesava ~390 KB e un diario da 56 pagine 21,7 MB — impubblicabile da
   *  telefono. Misurato sulle pagine reali: 1.5 con qualità 0.8 sta al ~37% di quel peso. */
  scale?: number
  /** Qualità JPEG di ogni pagina. 0.92 era una scelta da stampa tipografica su un documento che si
   *  legge a schermo e si condivide in chat. */
  quality?: number
}

/**
 * Sottoalberi che html2canvas deve saltare quando clona il documento.
 *
 * Serve per una ragione di costo, non di aspetto: html2canvas clona l'INTERO documento a ogni
 * chiamata, e questo modulo lo chiama una volta per blocco di pagine. Il Diario tiene a schermo
 * il libro completo (decine di pagine A4) mentre l'host fuori schermo ne contiene altrettanti
 * cloni: senza potatura ogni cattura ricopia entrambi, e il costo cresce col quadrato del numero
 * di pagine — il motivo per cui pubblicare un diario lungo diventava lentissimo.
 *
 * Chi impagina marca ciò che è già stato clonato altrove (o che comunque non deve finire nel PDF)
 * con `data-pdf-ignore`, e la cattura non lo attraversa nemmeno.
 */
const IGNORE_ATTR = 'data-pdf-ignore'

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

/**
 * Blocchi che non devono restare ultimi in pagina: tagliare subito sotto li lascerebbe orfani,
 * separati da ciò che introducono. Tipicamente le intestazioni di sezione — nel PDF del resoconto
 * si vedeva «02 CRONACA» da solo in fondo a una pagina, col testo che ricominciava sulla
 * successiva.
 */
const KEEP_NEXT_SELECTOR = '.pdf-keep-next'

/** Punti di taglio sicuri dentro `el`, in px CSS relativi al suo bordo superiore. */
function safeBreaks(el: HTMLElement, softBreakSelector: string, totalH: number): number[] {
  const elTop = el.getBoundingClientRect().top
  const breaks = new Set<number>([0, totalH])
  el.querySelectorAll<HTMLElement>(softBreakSelector).forEach(b => {
    if (b.matches(KEEP_NEXT_SELECTOR)) return
    // Il margine inferiore non fa parte del rect, ma è spazio bianco a tutti gli effetti: tagliare
    // dentro di esso invece che a filo dell'ultima riga tiene il taglio lontano dai glifi, che con
    // certi font sporgono di un paio di px sotto il bordo della loro riga.
    const marginBottom = parseFloat(getComputedStyle(b).marginBottom) || 0
    const bottom = Math.round(b.getBoundingClientRect().bottom - elTop + marginBottom / 2)
    if (bottom > 0 && bottom < totalH) breaks.add(bottom)
  })
  return Array.from(breaks).sort((a, b) => a - b)
}

/**
 * Fondo di ogni riga di testo dentro `el`. Sono punti di ripiego, usati solo quando nessun
 * `.pdf-block` entra nella pagina rimasta.
 *
 * Senza di essi il paginatore, non trovando un confine sicuro, tagliava all'altezza esatta della
 * pagina — cioè in mezzo a una riga, lasciando la metà superiore dei caratteri su una pagina e la
 * metà inferiore su quella dopo. Con i riquadri di riga il taglio peggiore possibile cade *fra*
 * due righe dello stesso paragrafo, che è la normale interruzione tipografica.
 */
function lineBreaks(el: HTMLElement, totalH: number): number[] {
  const elTop = el.getBoundingClientRect().top
  const out = new Set<number>()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!node.nodeValue?.trim()) continue
    range.selectNodeContents(node)
    for (const r of Array.from(range.getClientRects())) {
      const bottom = Math.round(r.bottom - elTop)
      if (bottom > 0 && bottom < totalH) out.add(bottom)
    }
  }
  return Array.from(out).sort((a, b) => a - b)
}

/**
 * Divide l'altezza di un elemento in fette non più alte di `availH`, agganciandosi al punto di
 * taglio sicuro più basso che entra nella pagina. Se un singolo blocco è più alto di una pagina
 * intera non c'è alternativa al taglio forzato: è il segnale che quel blocco va spezzato in
 * `.pdf-block` più piccoli nel template.
 */
function sliceHeights(
  breaks: number[],
  totalH: number,
  availH: number,
  fallbackBreaks: number[] = [],
): { top: number; height: number }[] {
  const slices: { top: number; height: number }[] = []
  const lastFitting = (list: number[], start: number, ideal: number) => {
    const fitting = list.filter(y => y > start && y <= ideal)
    return fitting.length ? fitting[fitting.length - 1] : null
  }
  let start = 0
  while (start < totalH - 1) {
    const ideal = start + availH
    let end: number
    if (ideal >= totalH) {
      end = totalH
    } else {
      // Preferenza: confine di blocco. Ripiego: fine di una riga di testo. Ultima spiaggia: il
      // bordo pagina — succede solo se un singolo blocco è più alto di una pagina intera e non
      // contiene testo (per esempio un'immagine fuori misura).
      end = lastFitting(breaks, start, ideal)
        ?? lastFitting(fallbackBreaks, start, ideal)
        ?? ideal
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

  const scale = options?.scale ?? 1.5
  const quality = options?.quality ?? 0.8
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
    // I riquadri di riga si calcolano solo se servono davvero, cioè se esiste almeno un tratto
    // fra due confini di blocco più lungo di una pagina: su un documento già ben spezzato in
    // `.pdf-block` è un costo inutile.
    const needsFallback = [...breaks, totalH].some((y, k, arr) => k > 0 && y - arr[k - 1] > availH)
    const fallback = needsFallback ? lineBreaks(el, totalH) : []
    for (const s of sliceHeights(breaks, totalH, availH, fallback)) {
      plan.push({ el, top: s.top, height: s.height, bleed })
    }
  }

  if (plan.length === 0) return pdf.output('blob')

  // ── Passo 2: catturare a blocchi, così nessun canvas supera MAX_CANVAS_PX ────────────────────
  // Si raggruppano pagine consecutive dello stesso elemento finché l'area resta nel budget: una
  // chiamata a html2canvas costa un clone completo del documento, quindi conviene ammortizzarla su
  // più pagine invece di pagarla una volta per pagina.
  const maxChunkH = Math.floor(MAX_CANVAS_PX / (PAGE_W * scale * scale))

  // Gli elementi da impaginare stanno tutti nello stesso contenitore fuori schermo, quindi ogni
  // cattura clonerebbe anche tutti gli altri. Marcandoli si cattura solo quello di turno: con N
  // pagine il costo passa da N cloni di N pagine (quadratico) a N cloni di una pagina.
  const isolate = (keep: HTMLElement) => {
    for (const other of elements) {
      if (other === keep) other.removeAttribute(IGNORE_ATTR)
      else other.setAttribute(IGNORE_ATTR, '')
    }
  }

  let pageNo = 0
  let i = 0
  try {
  while (i < plan.length) {
    const el = plan[i].el
    const chunkTop = plan[i].top
    isolate(el)
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
      // Pota i sottoalberi marcati prima ancora di clonarli — vedi IGNORE_ATTR. `el` non è mai
      // fra questi: è l'elemento che stiamo catturando, e html2canvas non applica il filtro alla
      // radice.
      ignoreElements: (node: Element) => node.hasAttribute?.(IGNORE_ATTR) ?? false,
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

      const imgData = slice.toDataURL('image/jpeg', quality)
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
  } finally {
    // Gli elementi possono essere cloni usa e getta o DOM vivo (il Diario passa cloni, ma nulla lo
    // impone): la marcatura va tolta comunque, anche se la cattura è fallita a metà.
    for (const el of elements) el.removeAttribute(IGNORE_ATTR)
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
