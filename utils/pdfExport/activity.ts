import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { StoredActivity } from '@/lib/blobStore'
import { formatDuration, msToKmh } from '@/lib/tcxParser'
import { fetchSatMap } from './mapTiles'
import { chartLine } from './canvasCharts'
import { safeText, txt, sectionBar, statBox, footer, FOREST, STONE, INK, WHITE } from './docHelpers'

// ── Activity PDF ───────────────────────────────────────────────────────────────
export async function exportActivityPdf(activity: StoredActivity): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, W = 182
  let y = 0

  // Header
  doc.setFillColor(...FOREST); doc.rect(0, 0, 210, 32, 'F')
  txt(doc, 'DTrek', M, 9,  { size: 12, bold: true, color: WHITE })
  txt(doc, 'Scheda Escursione', M, 14, { size: 7.5, color: [180, 240, 180] as [number,number,number] })
  let ttl = safeText(activity.title ?? activity.notes ?? 'Escursione')
  doc.setFontSize(17); doc.setFont('helvetica','bold'); doc.setTextColor(...WHITE)
  while (doc.getTextWidth(ttl) > W - 5 && ttl.length > 4) ttl = ttl.slice(0,-4) + '…'
  doc.text(ttl, M, 24)
  y = 35

  // Date + time
  const dateStr = format(new Date(activity.startTime), "EEEE d MMMM yyyy", { locale: it })
  const timeStr = `${format(new Date(activity.startTime),'HH:mm')} - ${format(new Date(activity.endTime),'HH:mm')}`
  txt(doc, `${dateStr}  |  ${timeStr}`, M, y, { size: 8.5, color: STONE })
  if (activity.device) {
    y += 4.5
    txt(doc, safeText(activity.device), M, y, { size: 7.5, color: STONE })
  }
  y += 4.5

  // Tags
  if ((activity.tags ?? []).length > 0) {
    let tx = M
    for (const tag of activity.tags!) {
      doc.setFontSize(7.5); doc.setFont('helvetica','normal')
      const tw = doc.getTextWidth(tag) + 5
      doc.setFillColor(220, 252, 231); doc.roundedRect(tx, y-2, tw, 4, 1.5, 1.5, 'F')
      doc.setTextColor(...FOREST); doc.text(safeText(tag), tx + 2.5, y + 0.7)
      tx += tw + 2
    }
    y += 6
  }

  // Stats grid (4 × 2)
  y = sectionBar(doc, 'Statistiche', M, y + 2, W, FOREST)
  const stats = [
    { label: 'Distanza',       value: `${(activity.distanceMeters/1000).toFixed(2)} km` },
    { label: 'Durata',         value: formatDuration(activity.totalTimeSeconds) },
    { label: 'FC Media',       value: `${activity.avgHeartRate} bpm`,             sub: `Max ${activity.maxHeartRate} bpm` },
    { label: 'Vel. Media',     value: `${msToKmh(activity.avgSpeedMs)} km/h`,      sub: `Max ${msToKmh(activity.maxSpeedMs)} km/h` },
    { label: 'Dislivello +',   value: `${activity.elevationGain.toFixed(0)} m`,    sub: `discesa ${activity.elevationLoss.toFixed(0)} m` },
    { label: 'Calorie',        value: `${activity.calories} kcal` },
    { label: 'Quota massima',  value: `${activity.altitudeMax.toFixed(0)} m slm` },
    { label: 'Quota minima',   value: `${activity.altitudeMin.toFixed(0)} m slm` },
  ]
  const cols = 4, bw = (W - 3 * 2) / cols, bh = 15
  stats.forEach((s, i) => {
    statBox(doc, s.label, s.value, s.sub, M + (i%cols)*(bw+2), y + Math.floor(i/cols)*(bh+2), bw, bh)
  })
  y += 2*(bh+2) + 4

  // Satellite map — full width, tall
  const rawPoly = activity.trackPoints.filter(p => p.lat && p.lon)
  const step0 = Math.max(1, Math.ceil(rawPoly.length / 300))
  const poly = rawPoly.filter((_,i) => i % step0 === 0).map(p => [p.lat!, p.lon!] as [number,number])
  if (poly.length > 1) {
    y = sectionBar(doc, 'Mappa del Percorso', M, y, W, FOREST)
    const mapH = 55  // mm
    const mapImg = await fetchSatMap(poly, 1440, Math.round(1440 * mapH / W), '#22c55e')
    if (mapImg) {
      doc.addImage(mapImg, 'PNG', M, y, W, mapH)
      // Info overlay text (top-right of map box)
      txt(doc, `${rawPoly.length.toLocaleString('it')} punti GPS`, M + W, y + 4.5, { size: 6.5, color: STONE, align: 'right' })
    }
    y += mapH + 2

    // Trackpoints info below map
    const startAlt = rawPoly[0]?.altitudeMeters?.toFixed(0) ?? '—'
    txt(doc, `Partenza: ${startAlt} m slm`, M, y, { size: 7.5, color: STONE })
    txt(doc, `Attivita: ${activity.sport ?? 'Escursionismo'}`, M + W, y, { size: 7.5, color: STONE, align: 'right' })
    y += 5
  }

  // Elevation profile
  const altPts = activity.trackPoints.filter(p => p.altitudeMeters !== undefined)
  if (altPts.length > 2) {
    if (y + 40 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Profilo Altimetrico', M, y + 1, W, FOREST)
    const elevData = Array.from({length: 250}, (_,i) => {
      const idx = Math.min(Math.round(i * (altPts.length-1) / 249), altPts.length-1)
      return altPts[idx].altitudeMeters!
    })
    const eImg = chartLine(elevData, 540, 150, '#3b82f6', '#bfdbfe')
    if (eImg) {
      doc.addImage(eImg, 'PNG', M, y, W, 38)
      const minA = Math.min(...elevData).toFixed(0), maxA = Math.max(...elevData).toFixed(0)
      txt(doc, `${minA} m`, M, y+40, { size: 7, color: STONE })
      txt(doc, `${maxA} m`, M + W, y+40, { size: 7, color: STONE, align: 'right' })
      y += 43
    }
  }

  // HR chart
  const hrPts = activity.trackPoints.filter(p => (p.heartRateBpm ?? 0) > 0)
  if (hrPts.length > 2) {
    if (y + 38 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Frequenza Cardiaca', M, y + 1, W, FOREST)
    const hrData = Array.from({length: 250}, (_,i) => {
      const idx = Math.min(Math.round(i * (hrPts.length-1) / 249), hrPts.length-1)
      return hrPts[idx].heartRateBpm!
    })
    const hImg = chartLine(hrData, 540, 110, '#ef4444', '#fecaca', {
      min: Math.max(0, Math.min(...hrData) - 10),
      max: Math.max(...hrData) + 5,
    })
    if (hImg) {
      doc.addImage(hImg, 'PNG', M, y, W, 28)
      txt(doc, `FC media ${activity.avgHeartRate} bpm  |  Max ${activity.maxHeartRate} bpm`, M, y+30, { size: 7.5, color: STONE })
      y += 34
    }
  }

  // Rating
  if (activity.userRating) {
    if (y + 18 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Valutazioni', M, y + 2, W, FOREST)
    const rc: [number,number,number] = activity.userRating >= 9 ? [22,163,74] : activity.userRating >= 7 ? [132,204,22] : activity.userRating >= 5 ? [249,115,22] : [239,68,68]
    doc.setFillColor(...rc); doc.roundedRect(M, y, 18, 13, 2, 2, 'F')
    txt(doc, String(activity.userRating), M+5, y+9, { size: 15, bold: true, color: WHITE })
    txt(doc, '/10  Il tuo voto', M+20, y+5.5, { size: 8 })
    if (activity.userRatingNote) txt(doc, safeText(`"${activity.userRatingNote}"`), M+20, y+10.5, { size: 8, color: STONE })
    y += 18
  }

  // Notes
  if (activity.userNotes?.trim()) {
    if (y + 30 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Note Personali', M, y + 2, W, FOREST)
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
    const lines = doc.splitTextToSize(safeText(activity.userNotes.trim()), W - 3)
    doc.text(lines, M, y)
    y += lines.length * 5 + 2
  }

  footer(doc, `Escursione del ${format(new Date(activity.startTime), 'dd/MM/yyyy')} · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-escursione-${format(new Date(activity.startTime),'yyyyMMdd')}.pdf`)
}
