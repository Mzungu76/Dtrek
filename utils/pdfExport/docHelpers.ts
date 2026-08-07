import { rgb, FOREST as FOREST_SCALE, STONE as STONE_SCALE, INK as INK_HEX, HAIRLINE, WHITE as WHITE_HEX } from '@/lib/designTokens'
import { pdfSafe } from '@/lib/pdfPaginate'

// ── Brand palette ──────────────────────────────────────────────────────────────
// Prima erano valori scelti a mano (es. FOREST=[22,101,52], che è esattamente il verde-800 di
// Tailwind, non un colore DTrek) — ora derivati da lib/designTokens.ts, la stessa fonte usata dai
// template DOM (Guida, Resoconto) e dalle immagini di condivisione, così Statistiche e Mappa (gli
// ultimi due documenti rimasti su jsPDF) non hanno più una terza idea di "verde DTrek" a sé.
export const FOREST  = rgb(FOREST_SCALE[600])
export const STONE50 = rgb(STONE_SCALE[50])
export const STONE   = rgb(STONE_SCALE[500])
export const INK     = rgb(INK_HEX)
export const BORDER  = rgb(HAIRLINE)
export const WHITE   = rgb(WHITE_HEX)

export type Doc = import('jspdf').jsPDF

/** Sanifica per jsPDF Helvetica (WinAnsi/CP1252) — vedi lib/pdfPaginate.ts:pdfSafe. Prima questo
 *  file aveva una propria versione limitata a Latin-1, che cancellava in silenzio trattini lunghi,
 *  virgolette curve e puntini di sospensione. */
export const safeText = pdfSafe

export function hexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

export function txt(
  doc: Doc, str: string, x: number, y: number,
  { size = 9, bold = false, color = INK, align = 'left' as 'left' | 'center' | 'right' } = {},
) {
  doc.setFontSize(size)
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setTextColor(...color)
  doc.text(safeText(str), x, y, { align })
}

export function sectionBar(doc: Doc, title: string, x: number, y: number, w: number, color: [number,number,number]): number {
  doc.setFillColor(...color)
  doc.rect(x, y, w, 6.5, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(safeText(title.toUpperCase()), x + 3, y + 4.5)
  return y + 6.5 + 3
}

/** Tronca `str` a un'unica riga che entra in `maxW` mm, aggiungendo un'ellissi CP1252-safe —
 *  senza, un'etichetta o un valore troppo lungo esce dal riquadro e si sovrappone a quello
 *  adiacente (era il caso di `statBox`, che non troncava affatto). */
function fitOneLine(doc: Doc, str: string, maxW: number): string {
  let s = safeText(str)
  if (doc.getTextWidth(s) <= maxW) return s
  while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1)
  return s + '…'
}

export function statBox(
  doc: Doc, label: string, value: string, sub: string | undefined,
  x: number, y: number, w: number, h: number,
) {
  doc.setFillColor(...STONE50); doc.roundedRect(x, y, w, h, 2, 2, 'F')
  doc.setDrawColor(...BORDER);  doc.roundedRect(x, y, w, h, 2, 2, 'S')
  const innerW = w - 5
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
  txt(doc, fitOneLine(doc, label, innerW), x + 2.5, y + 4,   { size: 6.5, color: STONE })
  doc.setFontSize(9.5); doc.setFont('helvetica', 'bold')
  txt(doc, fitOneLine(doc, value, innerW), x + 2.5, y + 9.5, { size: 9.5, bold: true })
  if (sub) {
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
    txt(doc, fitOneLine(doc, sub, innerW), x + 2.5, y + 13, { size: 6.5, color: STONE })
  }
}

/** Piè di pagina su ogni pagina del documento, ancorato al bordo reale della pagina — prima le
 *  coordinate (Y=291, X=196) erano cablate per A4 verticale (210×297mm): su `exportMapPdf`, che
 *  crea il documento in orizzontale (297×210mm), il piè cadeva a Y=291 su una pagina alta 210mm,
 *  cioè fuori pagina, e il numero a X=196 non era nemmeno il margine destro giusto (283mm in
 *  orizzontale). Leggendo le dimensioni reali da `doc.internal.pageSize` il piè si posiziona
 *  correttamente in entrambi gli orientamenti, senza che ogni chiamante debba saperlo. */
export function footer(doc: Doc, label: string) {
  const n = doc.getNumberOfPages()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const y = pageH - 6
  const rightX = pageW - 14
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180)
    doc.text(safeText(label), 14, y)
    doc.text(`Pagina ${i} di ${n}  DTrek`, rightX, y, { align: 'right' })
  }
}
