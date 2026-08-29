// Dtrek Page Turning Engine — istantanea della porzione di pagina attualmente visibile, usata
// SOLO dal lembo che si piega durante un trascinamento (components/libro/pageTurn/PageCurlOverlay.tsx):
// non si può piegare né mostrare il retro di contenuto vivo (una mappa Leaflet, un grafico) senza
// smontarlo o clonarlo — cosa che questo motore evita esplicitamente ovunque altro. Il resto della
// pagina (tutto ciò che il lembo non copre in un dato istante) resta il DOM reale, mai toccato.
//
// `html2canvas` è già una dipendenza del progetto (usata per l'export PDF, vedi lib/pdfPaginate.ts
// — stessa convenzione di import dinamico qui). Cattura solo la porzione VISIBILE nel viewport,
// non l'intera pagina del Diario/Guida (che può essere alta più schermate) — sia per prestazioni
// (rasterizzare migliaia di pixel di contenuto fuori vista sarebbe lento e inutile: il lembo può
// coprire solo quello che si vede ora) sia perché è concettualmente corretto: si sta piegando la
// porzione di foglio che si ha "in mano" in questo momento, non l'intero rotolo.
'use client'

export interface PageSnapshot {
  dataUrl: string
  /** Dimensioni dell'istantanea in px CSS (non px fisici — già divise per `scale`/DPR interno a
   *  html2canvas), così chi la usa può ragionare nelle stesse coordinate del layout a schermo. */
  width: number
  height: number
  /** Rettangolo (coordinate viewport, come `getBoundingClientRect`) di cosa rappresenta
   *  l'istantanea — la stessa geometria che PageCurlOverlay.tsx usa per posizionarsi in
   *  `position: fixed`, calcolata una sola volta qui invece che una seconda volta dal chiamante:
   *  se nel frattempo la pagina scorresse, le due misure prese in momenti diversi
   *  disallineerebbero l'overlay dal contenuto che dovrebbe coprire. */
  viewportRect: { top: number; left: number; width: number; height: number }
}

/** Porzione di `el` attualmente intersecata dal viewport verticale — `null` se non ce n'è
 *  (elemento del tutto fuori schermo). Esportata a parte perché un chiamante può volerla senza
 *  pagare il costo di una cattura vera (es. per decidere se vale la pena tentarla). */
export function visiblePageRect(el: HTMLElement): { top: number; left: number; width: number; height: number } | null {
  if (typeof window === 'undefined') return null
  const rect = el.getBoundingClientRect()
  const top = Math.max(0, rect.top)
  const bottom = Math.min(window.innerHeight, rect.bottom)
  const height = bottom - top
  if (rect.width <= 0 || height <= 0) return null
  return { top, left: rect.left, width: rect.width, height }
}

/**
 * Fotografa la porzione di `el` attualmente intersecata dal viewport. Ritorna `null` (mai
 * un'eccezione) se il rettangolo visibile è vuoto o se html2canvas fallisce — chi chiama deve
 * trattarlo come "nessuna istantanea disponibile ora" e usare il proprio fallback (Sezione 16
 * dello stesso principio già applicato a `prefers-reduced-motion`: un livello di ricchezza in
 * meno non è mai un errore bloccante).
 */
export async function captureVisiblePageSnapshot(el: HTMLElement, backgroundColor: string): Promise<PageSnapshot | null> {
  const viewportRect = visiblePageRect(el)
  if (!viewportRect) return null
  const { top: visibleTop, left, width, height } = viewportRect

  try {
    const html2canvas = (await import('html2canvas')).default
    // `x`/`y` sono nel sistema di coordinate del DOCUMENTO (non del viewport): servono lo scroll
    // corrente sommato alla posizione nel viewport. `scrollY: -window.scrollY` è la correzione
    // documentata di html2canvas per un bug noto — senza, la cattura scatta dal punto sbagliato
    // ogni volta che la pagina non è scrollata in cima.
    const canvas = await html2canvas(document.body, {
      x: Math.max(0, left),
      y: visibleTop + window.scrollY,
      width,
      height,
      scrollX: 0,
      scrollY: -window.scrollY,
      // Limita la densità reale dei pixel catturati — un'istantanea usata solo per ~1 secondo di
      // animazione non ha bisogno della piena densità di un display retina, e su mobile ogni
      // pixel in più qui è tempo di cattura (bloccante, JS) speso senza beneficio percepibile.
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      useCORS: true,
      // Il colore di sfondo del tema (mai `null`/trasparente): se un angolo della porzione
      // catturata non è coperto da nessun elemento, deve leggersi come "carta", non come una
      // finestra trasparente sul contenuto sottostante.
      backgroundColor,
      logging: false,
    })
    if (canvas.width <= 0 || canvas.height <= 0) return null
    return { dataUrl: canvas.toDataURL('image/png'), width, height, viewportRect }
  } catch {
    // html2canvas può fallire su contenuto che non sa interpretare (un gradiente esotico, un
    // `<canvas>` di terze parti "tainted") — un lembo senza istantanea è meglio di un errore che
    // blocca lo sfoglio: il chiamante ricade sul rotateY a pagina intera già esistente.
    return null
  }
}
