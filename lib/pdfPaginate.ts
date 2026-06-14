// Deterministic HTML → PDF pagination.
//
// html2pdf.js renders everything into one tall canvas and slices it at fixed
// page-height intervals, which cuts through photos/sections and emits blank
// pages whenever a section overflows a page boundary. This utility instead
// renders each top-level element with html2canvas and assembles the PDF with
// jsPDF, breaking ONLY at safe block boundaries (elements marked
// `.pdf-block`). The result paginates like the on-screen layout: no content
// cut in half, no stray blank pages.

const PAGE_W = 794   // A4 width  @ 96dpi (px)
const PAGE_H = 1123  // A4 height @ 96dpi (px)

/**
 * Render the given in-DOM elements into a single PDF blob.
 *
 * Each element starts on a fresh PDF page. Within an element, page breaks are
 * placed at the bottom of `.pdf-block` descendants so a block is never split
 * across two pages (unless a single block is taller than a full page, in which
 * case it is force-cut).
 *
 * Elements must already be mounted in the document (e.g. inside an off-screen
 * host) so their layout — and the layout of their `.pdf-block` children — is
 * computed before this runs.
 */
export async function paginateToPdf(
  elements: HTMLElement[],
  softBreakSelector = '.pdf-block',
): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H], orientation: 'portrait' })
  let firstPage = true

  for (const el of elements) {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      allowTaint: false,
      logging: false,
    })

    const cssTotalH = el.scrollHeight
    if (cssTotalH < 1) continue
    const pxPerCss = canvas.height / cssTotalH

    // Safe break positions (CSS px, relative to this element's top).
    const elTop = el.getBoundingClientRect().top
    const breaks = new Set<number>([0, cssTotalH])
    el.querySelectorAll<HTMLElement>(softBreakSelector).forEach(b => {
      const bottom = Math.round(b.getBoundingClientRect().bottom - elTop)
      if (bottom > 0 && bottom < cssTotalH) breaks.add(bottom)
    })
    const sorted = Array.from(breaks).sort((a, b) => a - b)

    let start = 0
    while (start < cssTotalH - 1) {
      const ideal = start + PAGE_H
      let end: number
      if (ideal >= cssTotalH) {
        end = cssTotalH
      } else {
        // Largest safe break that fits on this page; force-cut if a block is
        // itself taller than a page.
        const fitting = sorted.filter(y => y > start && y <= ideal)
        end = fitting.length ? fitting[fitting.length - 1] : ideal
      }

      const sliceCssH = end - start
      const sy = Math.round(start * pxPerCss)
      const sh = Math.max(1, Math.round(sliceCssH * pxPerCss))

      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sh
      const ctx = slice.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)

      const imgData = slice.toDataURL('image/jpeg', 0.92)
      if (!firstPage) pdf.addPage([PAGE_W, PAGE_H], 'portrait')
      firstPage = false
      // CSS px map 1:1 to PDF px (element width === PAGE_W), so no distortion.
      pdf.addImage(imgData, 'JPEG', 0, 0, PAGE_W, sliceCssH)

      start = end
    }
  }

  return pdf.output('blob')
}

/** Two animation frames — guarantees layout is flushed before measuring. */
export function nextLayout(): Promise<void> {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
}
