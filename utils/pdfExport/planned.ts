import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { PlannedHike } from '@/lib/plannedStore'
import type { PoiItem } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { formatDuration } from '@/lib/tcxParser'
import { fetchSatMap } from './mapTiles'
import { chartLine } from './canvasCharts'
import { safeText, hexColor, txt, sectionBar, statBox, footer, renderPois, SKY, STONE, INK, BORDER, WHITE } from './docHelpers'

// ── Planned Hike PDF ───────────────────────────────────────────────────────────
export async function exportPlannedPdf(hike: PlannedHike): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, W = 182
  let y = 0

  // Header
  doc.setFillColor(...SKY); doc.rect(0, 0, 210, 32, 'F')
  txt(doc, 'DTrek', M, 9,  { size: 12, bold: true, color: WHITE })
  txt(doc, 'Percorso Pianificato', M, 14, { size: 7.5, color: [180, 230, 255] as [number,number,number] })
  let ttl = safeText(hike.title)
  doc.setFontSize(17); doc.setFont('helvetica','bold'); doc.setTextColor(...WHITE)
  while (doc.getTextWidth(ttl) > W - 5 && ttl.length > 4) ttl = ttl.slice(0,-4) + '…'
  doc.text(ttl, M, 24)
  y = 35

  if (hike.plannedDate) {
    const dl = format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })
    txt(doc, dl, M, y, { size: 8.5, color: STONE }); y += 5
  }
  if ((hike.tags ?? []).length > 0) {
    let tx = M
    for (const tag of hike.tags!) {
      doc.setFontSize(7.5); doc.setFont('helvetica','normal')
      const tw = doc.getTextWidth(tag) + 5
      doc.setFillColor(224, 242, 254); doc.roundedRect(tx, y-2, tw, 4, 1.5, 1.5, 'F')
      doc.setTextColor(...SKY); doc.text(safeText(tag), tx+2.5, y+0.7)
      tx += tw + 2
    }
    y += 6
  }

  // Stats (5 boxes)
  y = sectionBar(doc, 'Statistiche', M, y + 2, W, SKY)
  const planStats = [
    { label: 'Distanza',       value: `${(hike.distanceMeters/1000).toFixed(2)} km` },
    { label: 'Dislivello +',   value: `${Math.round(hike.elevationGain)} m` },
    { label: 'Dislivello -',   value: `${Math.round(hike.elevationLoss)} m` },
    { label: 'Quota massima',  value: `${Math.round(hike.altitudeMax)} m slm`, sub: `Min: ${Math.round(hike.altitudeMin)} m` },
    { label: 'Tempo stimato',  value: formatDuration(hike.estimatedTimeSeconds), sub: 'Formula Naismith' },
  ]
  const bw = (W - 4 * 2) / 5, bh = 15
  planStats.forEach((s, i) => statBox(doc, s.label, s.value, s.sub, M + i*(bw+2), y, bw, bh))
  y += bh + 5

  // Satellite map — full width
  const poly = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number,number])
  const stepP = Math.max(1, Math.ceil(poly.length / 300))
  const sampledPoly = poly.filter((_,i) => i % stepP === 0)

  if (sampledPoly.length > 1) {
    y = sectionBar(doc, 'Mappa del Percorso', M, y, W, SKY)
    const mapH = 55
    const mapImg = await fetchSatMap(sampledPoly, 1440, Math.round(1440 * mapH / W), '#38bdf8')

    {
      doc.addImage(mapImg, 'PNG', M, y, W, mapH)
    }
    y += mapH + 3
  }

  // Elevation profile
  const altPts = (hike.trackPoints ?? []).filter(p => p.altitudeMeters !== undefined)
  if (altPts.length > 2) {
    if (y + 44 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Profilo Altimetrico', M, y + 1, W, SKY)
    const elevData = Array.from({length: 250}, (_,i) => {
      const idx = Math.min(Math.round(i * (altPts.length-1) / 249), altPts.length-1)
      return altPts[idx].altitudeMeters!
    })
    const eImg = chartLine(elevData, 540, 150, '#0369a1', '#bae6fd')
    if (eImg) {
      doc.addImage(eImg, 'PNG', M, y, W, 38)
      const minA = Math.min(...elevData).toFixed(0), maxA = Math.max(...elevData).toFixed(0)
      txt(doc, `${minA} m`, M, y+40, { size: 7, color: STONE })
      txt(doc, `${maxA} m`, M + W, y+40, { size: 7, color: STONE, align: 'right' })
      y += 43
    }
  }

  // Assessment
  if (hike.assessment) {
    if (y + 50 > 270) { doc.addPage(); y = 14 }
    const a = hike.assessment
    y = sectionBar(doc, 'Valutazione Personalizzata', M, y + 2, W, SKY)

    const diffColors: Record<string, string> = {
      facile: '#16a34a', moderata: '#d97706', impegnativa: '#ea580c', estrema: '#dc2626',
    }
    const diffLabels: Record<string, string> = {
      facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
    }
    const dc = hexColor(diffColors[a.difficulty] ?? '#78716c')
    doc.setFillColor(...dc); doc.roundedRect(M, y, 28, 7, 2, 2, 'F')
    txt(doc, diffLabels[a.difficulty] ?? a.difficulty, M+2, y+4.8, { size: 8, bold: true, color: WHITE })

    const barX = M + 32, barY = y + 1, barW2 = W - 34, barH2 = 5
    doc.setFillColor(...BORDER); doc.roundedRect(barX, barY, barW2, barH2, 2, 2, 'F')
    const suitColor: [number,number,number] = a.suitabilityScore >= 75 ? [22,163,74] : a.suitabilityScore >= 50 ? [245,158,11] : a.suitabilityScore >= 30 ? [234,88,12] : [220,38,38]
    doc.setFillColor(...suitColor)
    doc.roundedRect(barX, barY, Math.max(4, barW2 * a.suitabilityScore / 100), barH2, 2, 2, 'F')
    txt(doc, `Adatta a te: ${a.suitabilityScore}%`, barX, y+12, { size: 7.5, color: STONE })
    y += 16

    if (a.risks.length > 0) {
      txt(doc, 'Fattori di rischio:', M, y, { size: 7.5, bold: true, color: STONE }); y += 4
      a.risks.slice(0, 5).forEach(r => {
        if (y + 6 > 278) { doc.addPage(); y = 14 }
        const ic = r.type === 'danger' ? [239,68,68] as [number,number,number] : r.type === 'warning' ? [245,158,11] as [number,number,number] : [14,165,233] as [number,number,number]
        doc.setFillColor(...ic); doc.circle(M+2, y-0.8, 1.2, 'F')
        const lines = doc.splitTextToSize(safeText(r.text), W - 8)
        doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
        doc.text(lines, M+5, y)
        y += lines.length * 4.5
      })
    }
    if (a.suggestions.length > 0) {
      y += 2
      if (y + 6 > 278) { doc.addPage(); y = 14 }
      txt(doc, 'Consigli pratici:', M, y, { size: 7.5, bold: true, color: STONE }); y += 4
      a.suggestions.slice(0, 5).forEach(s => {
        if (y + 6 > 278) { doc.addPage(); y = 14 }
        doc.setFillColor(22, 163, 74); doc.circle(M+2, y-0.8, 1.2, 'F')
        const lines = doc.splitTextToSize(safeText(s.text), W - 8)
        doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
        doc.text(lines, M+5, y)
        y += lines.length * 4.5
      })
    }
    y += 4
  }

  // Notes
  if (hike.userNotes?.trim()) {
    if (y + 30 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Note Personali', M, y + 2, W, SKY)
    const lines = doc.splitTextToSize(safeText(hike.userNotes.trim()), W - 3)
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
    doc.text(lines, M, y)
    y += lines.length * 5 + 4
  }

  // POI section — new page if needed
  const wikiEntries = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const rawPois     = (hike.cachedPois     ?? []) as PoiItem[]

  if (wikiEntries.length > 0 || rawPois.length > 0) {
    if (y + 40 > 270) { doc.addPage(); y = 14 }
    y = renderPois(doc, wikiEntries, rawPois, M, W, y, SKY)
  }

  const dl = hike.plannedDate ? `pianificata il ${format(new Date(hike.plannedDate + 'T12:00'), 'dd/MM/yyyy')}` : 'senza data'
  footer(doc, `Percorso "${safeText(hike.title)}" · ${dl} · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-pianificato-${hike.title.replace(/\s+/g,'-').replace(/[^a-z0-9-]/gi,'').slice(0,30)}.pdf`)
}
