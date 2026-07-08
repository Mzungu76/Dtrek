import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'

// ── Brand palette ──────────────────────────────────────────────────────────────
export const FOREST  = [22,  101,  52] as [number, number, number]
export const SKY     = [3,   105, 161] as [number, number, number]
export const STONE50 = [250, 250, 249] as [number, number, number]
export const STONE   = [120, 113, 108] as [number, number, number]
export const INK     = [28,   25,  23] as [number, number, number]
export const BORDER  = [228, 228, 231] as [number, number, number]
export const WHITE   = [255, 255, 255] as [number, number, number]

export type Doc = import('jspdf').jsPDF

/** Strip emoji and non-latin characters that jsPDF Helvetica can't render */
export function safeText(s: string): string {
  // Remove characters outside latin-1 range that jsPDF Helvetica can't render
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x00-\xFF]/g, '').trim()
}

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
  doc.text(title.toUpperCase(), x + 3, y + 4.5)
  return y + 6.5 + 3
}

export function statBox(
  doc: Doc, label: string, value: string, sub: string | undefined,
  x: number, y: number, w: number, h: number,
) {
  doc.setFillColor(...STONE50); doc.roundedRect(x, y, w, h, 2, 2, 'F')
  doc.setDrawColor(...BORDER);  doc.roundedRect(x, y, w, h, 2, 2, 'S')
  txt(doc, label, x + 2.5, y + 4,   { size: 6.5, color: STONE })
  txt(doc, value, x + 2.5, y + 9.5, { size: 9.5, bold: true })
  if (sub) txt(doc, sub, x + 2.5, y + 13, { size: 6.5, color: STONE })
}

export function footer(doc: Doc, label: string) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180)
    doc.text(safeText(label), 14, 291)
    doc.text(`Pagina ${i} di ${n}  DTrek`, 196, 291, { align: 'right' })
  }
}

/** Render POIs section, return new y */
export function renderPois(
  doc: Doc,
  wikiEntries: { poi: PoiItem; wiki: WikiPage }[],
  rawPois: PoiItem[],
  M: number, W: number, startY: number,
  accentColor: [number,number,number],
): number {
  const totalWiki = wikiEntries.length
  const rawOnly   = rawPois.filter(p => !wikiEntries.some(e => e.poi.id === p.id))
  if (totalWiki === 0 && rawOnly.length === 0) return startY

  const label = totalWiki + rawOnly.length === 1
    ? '1 Luogo nel Percorso e Dintorni'
    : `${totalWiki + rawOnly.length} Luoghi nel Percorso e Dintorni`
  let y = sectionBar(doc, label, M, startY, W, accentColor)

  const POI_LABELS: Record<string, string> = {
    peak: 'Cima', hut: 'Rifugio', bivouac: 'Bivacco', spring: 'Sorgente',
    viewpoint: 'Belvedere', cross: 'Croce', pass: 'Valico', waterfall: 'Cascata',
    cave: 'Grotta', shelter: 'Riparo', ruins: 'Rovine', archaeological: 'Sito arch.',
    castle: 'Castello', fountain: 'Fontana', bench: 'Panchina', chapel: 'Cappella',
    picnic: 'Area picnic', tower: 'Torre', monument: 'Monumento',
  }

  // ── Wiki entries ─────────────────────────────────────────────────────────────
  wikiEntries.forEach(({ poi, wiki }) => {
    if (y + 22 > 280) { doc.addPage(); y = 14 }

    // Name row
    const name = safeText(wiki.title)
    const typeLabel = POI_LABELS[poi.type] ?? poi.type
    const distStr = poi.distFromTrack < 1000
      ? `${poi.distFromTrack.toFixed(0)} m dal percorso`
      : `${(poi.distFromTrack / 1000).toFixed(1)} km dal percorso`
    const altStr = poi.ele ? `  ${poi.ele} m slm` : ''

    txt(doc, name,      M,       y + 4, { size: 9, bold: true })
    txt(doc, typeLabel, M + doc.getTextWidth(name) + 4, y + 4, { size: 7.5, color: accentColor })
    txt(doc, distStr + altStr, M + W, y + 4, { size: 7, color: STONE, align: 'right' })
    y += 6

    // Description
    if (wiki.extract) {
      const excerpt = wiki.extract.slice(0, 340).replace(/\n+/g, ' ')
      const lines = doc.splitTextToSize(safeText(excerpt), W - 22)
      const shown = lines.slice(0, 2)
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...STONE)
      doc.text(shown, M + 2, y + 4)
      y += shown.length * 4 + 2
    }

    // Wikipedia link
    if (wiki.url) {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...accentColor)
      doc.text('Apri su Wikipedia  >', M + 2, y + 4)
      doc.link(M + 2, y, 44, 5, { url: wiki.url })
    }
    y += 7

    // Divider
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(M, y, M + W, y)
    y += 3
  })

  // ── Raw POIs (no wiki, compact 3-per-row) ────────────────────────────────────
  if (rawOnly.length > 0) {
    if (y + 8 > 280) { doc.addPage(); y = 14 }
    txt(doc, 'Altri punti di interesse:', M, y + 4, { size: 7.5, bold: true, color: STONE })
    y += 7
    const colW = (W - 4) / 3
    rawOnly.forEach((p, i) => {
      if (y + 8 > 280) { doc.addPage(); y = 14 }
      const col = i % 3
      const row = Math.floor(i / 3)
      const cx = M + col * (colW + 2)
      const cy = y + row * 7
      if (col === 0 && i > 0) { /* row started, already advanced */ }

      const label2 = POI_LABELS[p.type] ?? p.type
      const name2 = p.name ? safeText(p.name) : label2
      doc.setFillColor(...STONE50); doc.roundedRect(cx, cy - 2, colW, 6, 1.5, 1.5, 'F')
      txt(doc, name2.slice(0, 22), cx + 2, cy + 2.5, { size: 7.5 })
      txt(doc, label2, cx + colW, cy + 2.5, { size: 6.5, color: STONE, align: 'right' })

      if (col === 2 || i === rawOnly.length - 1) y += 8
    })
  }

  return y + 4
}
