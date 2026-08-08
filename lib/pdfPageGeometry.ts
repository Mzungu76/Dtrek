// Geometria della pagina PDF — solo numeri, nessuna dipendenza.
//
// Vive in un modulo a sé e non dentro `lib/pdfPaginate.ts` perché serve ai *template* (le pagine
// del Diario, che devono disegnarsi alte quanto l'area utile) mentre il paginatore si porta dietro
// html2canvas, jsPDF e gli helper immagine: importare le costanti da lì trascinava tutta quella
// catena nel bundle di /diario, che invece il paginatore lo carica solo al momento dell'export.

export const PDF_PAGE_W = 794   // A4 @ 96dpi (px)
export const PDF_PAGE_H = 1123

export const PDF_HEADER_H = 30
export const PDF_FOOTER_H = 26

/**
 * Altezza utile reale di una pagina: quella fisica meno testatina e piede.
 *
 * Un template che si disegna alto `PDF_PAGE_H` (l'A4 pieno) sfora di 56px e viene spezzato in due
 * pagine — una piena e una striscia quasi vuota. È esattamente quello che succedeva al Diario, le
 * cui pagine erano alte 1123px: ogni pagina del libro ne produceva due nel PDF.
 *
 * Solo gli elementi marcati `.pdf-bleed` (le copertine) possono usare `PDF_PAGE_H`: lì testatina e
 * piede non vengono disegnati.
 */
export const PDF_CONTENT_H = PDF_PAGE_H - PDF_HEADER_H - PDF_FOOTER_H
