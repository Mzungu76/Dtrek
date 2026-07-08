import { format } from 'date-fns'
import type { ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { chartAllRoutes } from './mapTiles'
import { safeText, txt, sectionBar, footer, FOREST, STONE, STONE50, WHITE } from './docHelpers'

// ── Map PDF (A4 landscape) ─────────────────────────────────────────────────────
export async function exportMapPdf(activities: ActivityMeta[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const M = 14, W = 269

  // Header (landscape A4 = 297 × 210)
  doc.setFillColor(...FOREST); doc.rect(0, 0, 297, 20, 'F')
  txt(doc, 'DTrek · Mappa Percorsi', M, 8, { size: 12, bold: true, color: WHITE })
  txt(doc, `${activities.length} escursioni`, M, 14, { size: 8, color: [180, 240, 180] as [number,number,number] })
  txt(doc, format(new Date(),'dd/MM/yyyy'), 297-M, 14, { size: 8, color: [180, 240, 180] as [number,number,number], align: 'right' })

  // All routes canvas
  const mapImg = chartAllRoutes(activities, 1800, 700)
  if (mapImg) {
    doc.addImage(mapImg, 'PNG', M, 22, W, 160)
  } else {
    txt(doc, 'Nessun tracciato GPS disponibile', M, 80, { size: 12, color: STONE })
  }

  // Activity list on page 2
  doc.addPage()
  let y = M
  y = sectionBar(doc, `Elenco Escursioni (${activities.length})`, M, y, W, FOREST)

  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 6, 'F')
  const cols3 = [
    { h: 'N.',      x: M,     w: 9  },
    { h: 'Data',    x: M+10,  w: 24 },
    { h: 'Titolo',  x: M+35,  w: 90 },
    { h: 'Km',      x: M+127, w: 18 },
    { h: 'D+',      x: M+147, w: 22 },
    { h: 'Durata',  x: M+171, w: 28 },
    { h: 'FC',      x: M+201, w: 24 },
    { h: 'Voto',    x: M+227, w: 16 },
    { h: 'Quota',   x: M+245, w: 24 },
  ]
  cols3.forEach(col => txt(doc, col.h, col.x+1, y+4.2, { size: 7.5, bold: true, color: FOREST }))
  y += 6

  const sorted = [...activities].sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  sorted.forEach((a, i) => {
    if (y > 190) { doc.addPage(); y = M }
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    const cells = [
      String(i+1),
      format(new Date(a.startTime), 'dd/MM/yy'),
      safeText(a.title ?? 'Escursione').slice(0, 38),
      `${(a.distanceMeters/1000).toFixed(1)}`,
      `${a.elevationGain.toFixed(0)} m`,
      formatDuration(a.totalTimeSeconds),
      `${a.avgHeartRate} bpm`,
      a.userRating ? `★${a.userRating}` : '-',
      `${a.altitudeMax.toFixed(0)} m`,
    ]
    cols3.forEach((col, ci) => txt(doc, cells[ci], col.x+1, y+4, { size: 7.5 }))
    y += 5.5
  })

  footer(doc, `Mappa DTrek · ${activities.length} percorsi · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-mappa-${format(new Date(),'yyyyMMdd')}.pdf`)
}
