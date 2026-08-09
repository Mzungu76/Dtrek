'use client'

// Composizione a colonne del Diario — misura, poi impagina.
//
// PERCHÉ NON `column-count`. La strada ovvia sarebbe dare al racconto `column-count: 2` e lasciar
// fare al browser. Non funziona con questo impaginatore, e il piano lo aveva già segnalato per la
// Guida (§4.1): le colonne CSS si riempiono una alla volta, quindi i fondi dei `.pdf-block` delle
// due colonne sono INTERLACCIATI lungo l'asse verticale. L'impaginatore, che cerca il punto di
// taglio più basso che entra nella pagina, ne troverebbe uno a metà della prima colonna mentre la
// seconda è ancora piena: il taglio cadrebbe in mezzo al testo. Peggio, un contenitore a colonne
// più alto della pagina trabocca in silenzio.
//
// L'unica strada corretta è comporre: misurare l'altezza reale di ogni blocco alla larghezza di
// colonna, distribuirli in colonne che non superano mai l'altezza utile, e produrre pagine già
// impaginate — che l'impaginatore riprende poi una a una senza dover tagliare nulla.
//
// Il compositore lavora su DOM puro (nessun React) perché gira su cloni usa e getta al momento
// dell'esportazione: i nodi vengono misurati e ricomposti, non renderizzati di nuovo.
//
// ── LA REGOLA DA NON VIOLARE ──────────────────────────────────────────────────────────────────
// Ogni misura deve avvenire su un elemento ATTACCATO al documento. `offsetHeight` su un nodo
// staccato torna 0, senza errori e senza avvisi. La prima versione costruiva le pagine staccate e
// leggeva lì l'altezza dell'apertura: veniva 0, l'area utile della prima pagina risultava piena
// invece che ridotta di ~390 px, e le colonne traboccavano fin oltre i 370 px — testo che finiva
// semplicemente fuori dalla pagina. Il difetto è emerso da una verifica automatica in Chromium,
// non a occhio: nel PDF si sarebbe visto solo come testo mancante.

import { PDF_PAGE_W, PDF_CONTENT_H } from './pdfPageGeometry'

export interface MagazineOptions {
  /** Colonne di testo. Due, a 706 px utili, danno righe da ~65 caratteri: la misura tipografica
   *  comoda. Tre scenderebbero a ~42, da quotidiano. */
  columns?: number
  gutter?: number
  padding?: number
  pageW?: number
  pageH?: number
}

const DEFAULTS = { columns: 2, gutter: 24, padding: 44, pageW: PDF_PAGE_W, pageH: PDF_CONTENT_H }

/** Marcatori che il template dichiara sul proprio DOM. */
export const MAG = {
  /** Apertura dell'articolo: fascia foto, titolo, striscia dati. Sta solo sulla prima pagina. */
  opening: '[data-mag="opening"]',
  /** Blocco che partecipa al flusso a colonne. */
  block: '[data-mag-block]',
  /** Non deve restare ultimo in colonna (intestazioni di sezione). */
  keepAttr: 'data-mag-keep',
  /** Coda a piena larghezza (mappa, grafici, galleria): dopo il testo, fuori dalle colonne. */
  tail: '[data-mag="tail"]',
}

interface Measured { node: HTMLElement; height: number; keep: boolean }

/** Banco di misura: un contenitore attaccato al documento, di larghezza nota. */
function withRuler<T>(width: number, fn: (host: HTMLElement) => T): T {
  const host = document.createElement('div')
  host.style.cssText = `position:absolute;left:-99999px;top:0;width:${width}px;visibility:hidden`
  document.body.appendChild(host)
  try {
    return fn(host)
  } finally {
    document.body.removeChild(host)
  }
}

/** Altezza occupata da un nodo alla larghezza data, margini verticali compresi. */
function measureAt(nodes: HTMLElement[], width: number): { node: HTMLElement; height: number }[] {
  if (nodes.length === 0) return []
  return withRuler(width, host =>
    nodes.map(src => {
      const node = src.cloneNode(true) as HTMLElement
      host.appendChild(node)
      const cs = getComputedStyle(node)
      const height = node.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0)
      host.removeChild(node)
      return { node, height }
    }),
  )
}

function pageShell(o: typeof DEFAULTS, extraCss = ''): HTMLElement {
  const page = document.createElement('div')
  page.className = 'diario-page diario-mag-page'
  page.setAttribute('data-mag-page', '')
  page.style.cssText =
    `width:${o.pageW}px;height:${o.pageH}px;background:#fff;margin:0 auto;` +
    `overflow:hidden;position:relative;box-sizing:border-box;${extraCss}`
  return page
}

function makeColumn(colW: number): HTMLElement {
  const col = document.createElement('div')
  // Attributo esplicito, non solo stile: serve a ritrovare le colonne (verifica automatica,
  // ispezione del DOM composto) senza dipendere da come il browser normalizza `style`.
  col.setAttribute('data-mag-col', '')
  col.style.cssText = `width:${colW}px;flex:0 0 ${colW}px;overflow:hidden`
  return col
}

/**
 * Impagina un articolo del Diario in pagine A4 già composte.
 *
 * @param source elemento (clonato) che espone i marcatori `MAG`
 * @returns le pagine, ciascuna alta esattamente l'area utile: l'impaginatore ne fa una pagina PDF
 *          a testa senza dover calcolare alcun taglio.
 */
export function composeReportPages(source: HTMLElement, options: MagazineOptions = {}): HTMLElement[] {
  // Il template può imporre il numero di colonne: la pagina delle statistiche è fatta di griglie
  // di schede a quattro colonne, che dentro una colonna da 341 px diventerebbero illeggibili —
  // lì serve una colonna sola a piena larghezza, con i blocchi impilati fitti.
  const declared = Number(source.getAttribute('data-mag-columns'))
  const o = { ...DEFAULTS, ...options, ...(declared > 0 ? { columns: declared } : {}) }
  const innerW = o.pageW - 2 * o.padding
  const colW = Math.floor((innerW - o.gutter * (o.columns - 1)) / o.columns)

  const openingSrc = source.querySelector<HTMLElement>(MAG.opening)
  const tailSrcs = Array.from(source.querySelectorAll<HTMLElement>(MAG.tail))
  // Un elemento non può stare in due posti: se porta entrambi i marcatori vince la coda, e non
  // finisce duplicato anche nelle colonne. Non è teoria — marcando il template è successo davvero
  // su tutti e cinque i blocchi di coda, che avevano già `.pdf-block`.
  const blockSrcs = Array.from(source.querySelectorAll<HTMLElement>(MAG.block))
    .filter(el => !el.matches(MAG.tail) && !el.closest(MAG.tail))

  // ── Tutte le misure PRIMA di costruire le pagine, ognuna alla propria larghezza ──────────────
  // L'apertura è a piena pagina (fascia al vivo), i blocchi a larghezza di colonna, la coda
  // dentro i margini.
  const openingMeasured = openingSrc ? measureAt([openingSrc], o.pageW)[0] : null
  const measured: Measured[] = measureAt(blockSrcs, colW).map((m, i) => ({
    ...m,
    keep: blockSrcs[i].hasAttribute(MAG.keepAttr),
  }))
  const tailMeasured = measureAt(tailSrcs, innerW)

  const pages: HTMLElement[] = []
  let page = pageShell(o)
  let row = document.createElement('div')
  row.style.cssText = `display:flex;gap:${o.gutter}px;align-items:flex-start;padding:0 ${o.padding}px;box-sizing:border-box`
  page.appendChild(row)
  pages.push(page)

  const openingH = openingMeasured?.height ?? 0
  if (openingMeasured) page.insertBefore(openingMeasured.node, row)

  let colIndex = 0
  let col = makeColumn(colW)
  row.appendChild(col)
  let used = 0
  let availH = o.pageH - openingH

  const nextColumn = () => {
    colIndex++
    if (colIndex >= o.columns) {
      page = pageShell(o)
      row = document.createElement('div')
      row.style.cssText = `display:flex;gap:${o.gutter}px;align-items:flex-start;padding:0 ${o.padding}px;box-sizing:border-box`
      page.appendChild(row)
      pages.push(page)
      colIndex = 0
      availH = o.pageH
    }
    col = makeColumn(colW)
    row.appendChild(col)
    used = 0
  }

  for (let i = 0; i < measured.length; i++) {
    const m = measured[i]

    if (m.keep && used > 0) {
      // Un'intestazione non deve restare ultima in colonna: se dopo di lei non entrano almeno le
      // prime righe del blocco che introduce, passa alla colonna dopo insieme a lui. Stesso
      // principio di `.pdf-keep-next` nell'impaginatore, applicato qui alle colonne.
      const next = measured[i + 1]
      const needed = m.height + Math.min(next?.height ?? 0, 90)
      if (used + needed > availH) nextColumn()
    } else if (used > 0 && used + m.height > availH) {
      nextColumn()
    }

    col.appendChild(m.node)
    used += m.height
  }

  // ── Coda a piena larghezza (mappa, grafici, galleria) ────────────────────────────────────────
  // Su pagine proprie, fuori dalle colonne: è materiale di consultazione, non parte del racconto.
  if (tailMeasured.length > 0) {
    let tailPage = pageShell(o, `padding:${o.padding}px`)
    let tailUsed = 0
    const limit = o.pageH - 2 * o.padding
    for (const t of tailMeasured) {
      if (tailUsed > 0 && tailUsed + t.height > limit) {
        pages.push(tailPage)
        tailPage = pageShell(o, `padding:${o.padding}px`)
        tailUsed = 0
      }
      tailPage.appendChild(t.node)
      tailUsed += t.height
    }
    if (tailPage.childElementCount > 0) pages.push(tailPage)
  }

  return pages
}

/**
 * Impagina una sequenza di schede compatte (escursioni senza racconto) su pagine piene.
 *
 * Da sole occupavano due pagine a testa, con la fascia foto scura vuota e lo spazio del racconto
 * bianco: il difetto più vistoso del PDF precedente. Impilate, ne stanno tre o quattro per pagina.
 */
export function composeCardPages(cards: HTMLElement[], options: MagazineOptions = {}): HTMLElement[] {
  const o = { ...DEFAULTS, ...options }
  if (cards.length === 0) return []

  const innerW = o.pageW - 2 * o.padding
  const measured = measureAt(cards, innerW)
  const limit = o.pageH - 2 * o.padding

  const pages: HTMLElement[] = []
  let page = pageShell(o, `padding:${o.padding}px`)
  let used = 0
  for (const m of measured) {
    if (used > 0 && used + m.height > limit) {
      pages.push(page)
      page = pageShell(o, `padding:${o.padding}px`)
      used = 0
    }
    page.appendChild(m.node)
    used += m.height
  }
  if (page.childElementCount > 0) pages.push(page)
  return pages
}
