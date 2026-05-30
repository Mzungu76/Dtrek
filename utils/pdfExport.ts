/**
 * DTrek PDF export — uses jsPDF with inline Canvas-based chart rendering.
 * Text is fully selectable; charts are rasterised at 2× for clarity.
 */

import { format } from 'date-fns'
import { it }     from 'date-fns/locale'
import type { StoredActivity, ActivityMeta } from '@/lib/blobStore'
import type { PlannedHike }                  from '@/lib/plannedStore'
import { formatDuration, msToKmh }           from '@/lib/tcxParser'
import { getPersonalRecords, computeStreaks, difficultyIndex } from '@/lib/stats'
import { computeGlobalStats }                from '@/lib/blobStore'

// ── Brand palette ──────────────────────────────────────────────────────────────
const FOREST  = [22,  101,  52] as [number, number, number]
const SKY     = [3,   105, 161] as [number, number, number]
const STONE50 = [250, 250, 249] as [number, number, number]
const STONE   = [120, 113, 108] as [number, number, number]
const INK     = [28,   25,  23] as [number, number, number]
const BORDER  = [228, 228, 231] as [number, number, number]
const WHITE   = [255, 255, 255] as [number, number, number]

// ── Canvas chart renderers ─────────────────────────────────────────────────────

function mkCanvas(w: number, h: number, scale = 2) {
  const c = document.createElement('canvas')
  c.width = w * scale; c.height = h * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  return { c, ctx }
}

/** Line/area chart — returns PNG data-URL */
function chartLine(
  data: number[], w: number, h: number,
  line: string, fill: string,
  opts?: { min?: number; max?: number },
): string {
  const { c, ctx } = mkCanvas(w, h)
  const minV = opts?.min ?? Math.min(...data)
  const maxV = opts?.max ?? Math.max(...data)
  const range = maxV - minV || 1
  const pad = 4

  // Background
  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, w, h)

  const pts = data.map((v, i): [number, number] => [
    pad + (i / (data.length - 1)) * (w - 2 * pad),
    h - pad - ((v - minV) / range) * (h - 2 * pad),
  ])

  // Area
  ctx.beginPath()
  ctx.moveTo(pts[0][0], h - pad)
  pts.forEach(([x, y]) => ctx.lineTo(x, y))
  ctx.lineTo(pts[pts.length - 1][0], h - pad)
  ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()

  // Line
  ctx.beginPath()
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.strokeStyle = line; ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'; ctx.stroke()

  return c.toDataURL('image/png')
}

/** Vertical bar chart — returns PNG data-URL */
function chartBar(
  data: { label: string; value: number }[],
  w: number, h: number,
  barColor: string, showLabels = true,
): string {
  if (!data.length) return ''
  const { c, ctx } = mkCanvas(w, h)
  const maxV = Math.max(...data.map(d => d.value), 1)
  const labelH = showLabels ? 18 : 4
  const barAreaH = h - labelH
  const slotW = w / data.length

  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, w, h)

  data.forEach((d, i) => {
    const bh = (d.value / maxV) * barAreaH * 0.92
    const bw = slotW * 0.64
    const bx = i * slotW + (slotW - bw) / 2
    const by = barAreaH - bh

    ctx.fillStyle = barColor
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, bw, bh, 3)
    else ctx.rect(bx, by, bw, bh)
    ctx.fill()

    if (d.value > 0) {
      // Value label above bar
      ctx.fillStyle = barColor
      ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(d.value), bx + bw / 2, by - 2)
    }

    if (showLabels) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(d.label, bx + bw / 2, h - 4)
    }
  })

  return c.toDataURL('image/png')
}

/** Polyline normalised to canvas — returns PNG data-URL */
function chartRoute(
  pts: [number, number][],
  w: number, h: number,
  lineColor = '#166534',
): string {
  if (pts.length < 2) return ''
  const { c, ctx } = mkCanvas(w, h)
  const pad = 14
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const latR = maxLat - minLat || 0.001, lonR = maxLon - minLon || 0.001
  const sc = Math.min((w - 2 * pad) / lonR, (h - 2 * pad) / latR)
  const xOff = pad + ((w - 2 * pad) - lonR * sc) / 2
  const yOff = pad + ((h - 2 * pad) - latR * sc) / 2

  const px = (lon: number) => xOff + (lon - minLon) * sc
  const py = (lat: number) => yOff + (maxLat - lat) * sc

  // Background
  ctx.fillStyle = '#f0f9ff'
  if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(0, 0, w, h, 6); ctx.fill() }
  else { ctx.fillRect(0, 0, w, h) }

  // Route line
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.beginPath()
  pts.forEach(([lat, lon], i) => i === 0 ? ctx.moveTo(px(lon), py(lat)) : ctx.lineTo(px(lon), py(lat)))
  ctx.stroke()

  // Start / end dots
  const dot = (lat: number, lon: number, col: string) => {
    ctx.beginPath(); ctx.arc(px(lon), py(lat), 4, 0, Math.PI * 2)
    ctx.fillStyle = col; ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
  }
  dot(pts[0][0], pts[0][1], '#22c55e')
  dot(pts[pts.length-1][0], pts[pts.length-1][1], '#ef4444')

  return c.toDataURL('image/png')
}

/** All routes on a single canvas — returns PNG data-URL */
function chartAllRoutes(activities: ActivityMeta[], w: number, h: number): string {
  const polylines = activities.filter(a => (a.routePolyline?.length ?? 0) > 1).map(a => a.routePolyline!)
  if (!polylines.length) return ''
  const { c, ctx } = mkCanvas(w, h, 3)
  const pad = 20
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  polylines.forEach(pl => pl.forEach(([la, lo]) => {
    if (la < minLat) minLat = la; if (la > maxLat) maxLat = la
    if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo
  }))
  const latR = maxLat - minLat || 0.001, lonR = maxLon - minLon || 0.001
  const sc = Math.min((w - 2 * pad) / lonR, (h - 2 * pad) / latR)
  const xOff = pad + ((w - 2 * pad) - lonR * sc) / 2
  const yOff = pad + ((h - 2 * pad) - latR * sc) / 2
  const px = (lo: number) => xOff + (lo - minLon) * sc
  const py = (la: number) => yOff + (maxLat - la) * sc

  ctx.fillStyle = '#f0f9ff'; ctx.fillRect(0, 0, w, h)

  const PALETTE = ['#166534','#0369a1','#9333ea','#c2410c','#0f766e','#b45309','#be123c','#1d4ed8']
  polylines.forEach((pl, idx) => {
    ctx.strokeStyle = PALETTE[idx % PALETTE.length]
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.globalAlpha = 0.72
    ctx.beginPath()
    pl.forEach(([la, lo], i) => i === 0 ? ctx.moveTo(px(lo), py(la)) : ctx.lineTo(px(lo), py(la)))
    ctx.stroke()
  })
  ctx.globalAlpha = 1
  return c.toDataURL('image/png')
}

// ── jsPDF helpers ──────────────────────────────────────────────────────────────

type Doc = import('jspdf').jsPDF

function hexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

function txt(
  doc: Doc, str: string, x: number, y: number,
  { size = 9, bold = false, color = INK, align = 'left' as 'left' | 'center' | 'right' | 'justify' } = {},
) {
  doc.setFontSize(size)
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setTextColor(...color)
  doc.text(str, x, y, { align })
}

function sectionBar(doc: Doc, title: string, x: number, y: number, w: number, color: [number,number,number]): number {
  doc.setFillColor(...color)
  doc.rect(x, y, w, 6.5, 'F')
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  doc.text(title.toUpperCase(), x + 3, y + 4.5)
  return y + 6.5 + 3
}

function statBox(
  doc: Doc, label: string, value: string, sub: string | undefined,
  x: number, y: number, w: number, h: number,
) {
  doc.setFillColor(...STONE50); doc.roundedRect(x, y, w, h, 2, 2, 'F')
  doc.setDrawColor(...BORDER);   doc.roundedRect(x, y, w, h, 2, 2, 'S')
  txt(doc, label, x + 2.5, y + 4,   { size: 6.5, color: STONE })
  txt(doc, value, x + 2.5, y + 9.5, { size: 9.5, bold: true })
  if (sub) txt(doc, sub, x + 2.5, y + 13, { size: 6.5, color: STONE })
}

function footer(doc: Doc, label: string) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180)
    doc.text(label, 14, 291)
    doc.text(`Pagina ${i} di ${n} · DTrek`, 196, 291, { align: 'right' })
  }
}

// ── Activity PDF ───────────────────────────────────────────────────────────────
export async function exportActivityPdf(activity: StoredActivity): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, W = 182
  let y = 0

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(...FOREST); doc.rect(0, 0, 210, 32, 'F')
  txt(doc, 'DTrek', M, 9,  { size: 12, bold: true, color: WHITE })
  txt(doc, 'Scheda Escursione', M, 14, { size: 7.5, color: [180, 240, 180] })
  let ttl = activity.title ?? activity.notes ?? 'Escursione'
  doc.setFontSize(17); doc.setFont('helvetica','bold'); doc.setTextColor(...WHITE)
  while (doc.getTextWidth(ttl) > W - 5 && ttl.length > 4) ttl = ttl.slice(0,-4) + '…'
  doc.text(ttl, M, 24)
  y = 35

  // Date, time, device
  const dateStr = format(new Date(activity.startTime), "EEEE d MMMM yyyy", { locale: it })
  const timeStr = `${format(new Date(activity.startTime),'HH:mm')} – ${format(new Date(activity.endTime),'HH:mm')}`
  txt(doc, `${dateStr}  ·  ${timeStr}`, M, y, { size: 8.5, color: STONE })
  if (activity.device) { y += 4.5; txt(doc, `📱 ${activity.device}`, M, y, { size: 7.5, color: STONE }) }
  y += 4.5

  // Tags
  if ((activity.tags ?? []).length > 0) {
    let tx = M
    for (const tag of activity.tags!) {
      doc.setFontSize(7.5); doc.setFont('helvetica','normal')
      const tw = doc.getTextWidth(tag) + 5
      doc.setFillColor(220, 252, 231); doc.roundedRect(tx, y-2, tw, 4, 1.5, 1.5, 'F')
      doc.setTextColor(...FOREST); doc.text(tag, tx + 2.5, y + 0.7)
      tx += tw + 2
    }
    y += 6
  }

  // ── Stats grid (8 cells, 4 columns) ─────────────────────────────────────────
  y = sectionBar(doc, 'Statistiche', M, y + 2, W, FOREST)
  const stats = [
    { label: 'Distanza',       value: `${(activity.distanceMeters/1000).toFixed(2)} km` },
    { label: 'Durata',         value: formatDuration(activity.totalTimeSeconds) },
    { label: 'FC Media',       value: `${activity.avgHeartRate} bpm`,        sub: `Max ${activity.maxHeartRate} bpm` },
    { label: 'Vel. Media',     value: `${msToKmh(activity.avgSpeedMs)} km/h`, sub: `Max ${msToKmh(activity.maxSpeedMs)} km/h` },
    { label: 'Dislivello +',   value: `${activity.elevationGain.toFixed(0)} m`, sub: `↓ ${activity.elevationLoss.toFixed(0)} m` },
    { label: 'Calorie',        value: `${activity.calories} kcal` },
    { label: 'Quota massima',  value: `${activity.altitudeMax.toFixed(0)} m slm` },
    { label: 'Quota minima',   value: `${activity.altitudeMin.toFixed(0)} m slm` },
  ]
  const cols = 4, bw = (W - 3 * 2) / cols, bh = 15
  stats.forEach((s, i) => {
    const row = Math.floor(i / cols), col = i % cols
    statBox(doc, s.label, s.value, s.sub, M + col * (bw + 2), y + row * (bh + 2), bw, bh)
  })
  y += 2 * (bh + 2) + 3

  // ── Route map + side info ────────────────────────────────────────────────────
  const rawPoly = activity.trackPoints.filter(p => p.lat && p.lon)
  const step0 = Math.max(1, Math.ceil(rawPoly.length / 250))
  const poly = rawPoly.filter((_,i) => i % step0 === 0).map(p => [p.lat!, p.lon!] as [number,number])
  if (poly.length > 1) {
    y = sectionBar(doc, 'Tracciato GPS', M, y + 1, W, FOREST)
    const img = chartRoute(poly, 180, 80)
    if (img) {
      doc.addImage(img, 'PNG', M, y, 90, 40)
      // Side info
      const sx = M + 93
      txt(doc, `${rawPoly.length.toLocaleString('it')} trackpoints`, sx, y + 6,  { size: 8 })
      txt(doc, `Passo medio: ${activity.sport ?? 'Escursionismo'}`,    sx, y + 11, { size: 8 })
      txt(doc, `Alt. partenza: ${rawPoly[0]?.altitudeMeters?.toFixed(0) ?? '—'} m`, sx, y + 16, { size: 8 })
    }
    y += 43
  }

  // ── Elevation profile ────────────────────────────────────────────────────────
  const altPts = activity.trackPoints.filter(p => p.altitudeMeters !== undefined)
  if (altPts.length > 2) {
    y = sectionBar(doc, 'Profilo Altimetrico', M, y + 1, W, FOREST)
    const SAMPLES = 200
    const elevData = Array.from({length: SAMPLES}, (_,i) => {
      const idx = Math.min(Math.round(i * (altPts.length-1) / (SAMPLES-1)), altPts.length-1)
      return altPts[idx].altitudeMeters!
    })
    const eImg = chartLine(elevData, 540, 140, '#3b82f6', '#bfdbfe')
    if (eImg) {
      doc.addImage(eImg, 'PNG', M, y, W, 35)
      const minA = Math.min(...elevData).toFixed(0), maxA = Math.max(...elevData).toFixed(0)
      txt(doc, `${minA} m`, M, y+37, { size: 7, color: STONE })
      txt(doc, `${maxA} m`, M + W, y+37, { size: 7, color: STONE, align: 'right' })
      y += 40
    }
  }

  // ── HR chart ─────────────────────────────────────────────────────────────────
  const hrPts = activity.trackPoints.filter(p => (p.heartRateBpm ?? 0) > 0)
  if (hrPts.length > 2) {
    if (y + 38 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Frequenza Cardiaca', M, y + 1, W, FOREST)
    const hrData = Array.from({length: 200}, (_,i) => {
      const idx = Math.min(Math.round(i * (hrPts.length-1) / 199), hrPts.length-1)
      return hrPts[idx].heartRateBpm!
    })
    const hImg = chartLine(hrData, 540, 110, '#ef4444', '#fecaca', {
      min: Math.max(0, Math.min(...hrData) - 10),
      max: Math.max(...hrData) + 5,
    })
    if (hImg) {
      doc.addImage(hImg, 'PNG', M, y, W, 28)
      txt(doc, `FC media ${activity.avgHeartRate} bpm  ·  Max ${activity.maxHeartRate} bpm`, M, y+30, { size: 7.5, color: STONE })
      y += 33
    }
  }

  // ── User rating ───────────────────────────────────────────────────────────────
  if (activity.userRating) {
    if (y + 18 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Il Tuo Voto', M, y + 2, W, FOREST)
    const rc: [number,number,number] = activity.userRating >= 9 ? [22,163,74] : activity.userRating >= 7 ? [132,204,22] : activity.userRating >= 5 ? [249,115,22] : [239,68,68]
    doc.setFillColor(...rc); doc.roundedRect(M, y, 18, 13, 2, 2, 'F')
    txt(doc, String(activity.userRating), M+5, y+9, { size: 15, bold: true, color: WHITE })
    txt(doc, '/10', M+20, y+9, { size: 9, bold: true })
    if (activity.userRatingNote) txt(doc, `"${activity.userRatingNote}"`, M+30, y+9, { size: 8.5, color: STONE })
    y += 16
  }

  // ── Beauty score ──────────────────────────────────────────────────────────────
  if (activity.linkedBeautyScore) {
    if (y + 18 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Pagella Escursione', M, y + 2, W, FOREST)
    const bs = activity.linkedBeautyScore
    const bc = hexColor(bs.color)
    doc.setFillColor(...bc); doc.roundedRect(M, y, 20, 13, 2, 2, 'F')
    txt(doc, bs.overall.toFixed(1), M+2, y+9, { size: 13, bold: true, color: WHITE })
    txt(doc, '/10', M+22, y+9, { size: 9, bold: true })
    txt(doc, 'Valutazione automatica · OSM + Wikipedia', M+35, y+6.5, { size: 8, color: STONE })
    y += 16
  }

  // ── Notes ────────────────────────────────────────────────────────────────────
  if (activity.userNotes?.trim()) {
    if (y + 30 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Note Personali', M, y + 2, W, FOREST)
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
    const lines = doc.splitTextToSize(activity.userNotes.trim(), W - 3)
    doc.text(lines, M, y)
    y += lines.length * 5 + 2
  }

  footer(doc, `Escursione del ${format(new Date(activity.startTime), 'dd/MM/yyyy')} · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-escursione-${format(new Date(activity.startTime),'yyyyMMdd')}.pdf`)
}

// ── Planned Hike PDF ───────────────────────────────────────────────────────────
export async function exportPlannedPdf(hike: PlannedHike): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, W = 182
  let y = 0

  // Header
  doc.setFillColor(...SKY); doc.rect(0, 0, 210, 32, 'F')
  txt(doc, 'DTrek', M, 9,  { size: 12, bold: true, color: WHITE })
  txt(doc, 'Percorso Pianificato', M, 14, { size: 7.5, color: [180, 230, 255] })
  let ttl = hike.title
  doc.setFontSize(17); doc.setFont('helvetica','bold'); doc.setTextColor(...WHITE)
  while (doc.getTextWidth(ttl) > W - 5 && ttl.length > 4) ttl = ttl.slice(0,-4) + '…'
  doc.text(ttl, M, 24)
  y = 35

  if (hike.plannedDate) {
    const dl = format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })
    txt(doc, `📅 ${dl}`, M, y, { size: 8.5, color: STONE }); y += 5
  }
  if ((hike.tags ?? []).length > 0) {
    let tx = M
    for (const tag of hike.tags!) {
      doc.setFontSize(7.5); doc.setFont('helvetica','normal')
      const tw = doc.getTextWidth(tag) + 5
      doc.setFillColor(224, 242, 254); doc.roundedRect(tx, y-2, tw, 4, 1.5, 1.5, 'F')
      doc.setTextColor(...SKY); doc.text(tag, tx+2.5, y+0.7)
      tx += tw + 2
    }
    y += 6
  }

  // Stats
  y = sectionBar(doc, 'Statistiche', M, y + 2, W, SKY)
  const stats = [
    { label: 'Distanza',       value: `${(hike.distanceMeters/1000).toFixed(2)} km` },
    { label: 'Dislivello +',   value: `${Math.round(hike.elevationGain)} m` },
    { label: 'Dislivello −',   value: `${Math.round(hike.elevationLoss)} m` },
    { label: 'Quota massima',  value: `${Math.round(hike.altitudeMax)} m slm`, sub: `Min: ${Math.round(hike.altitudeMin)} m` },
    { label: 'Tempo stimato',  value: formatDuration(hike.estimatedTimeSeconds), sub: 'Formula Naismith' },
  ]
  const bw = (W - 4 * 2) / 5, bh = 15
  stats.forEach((s, i) => statBox(doc, s.label, s.value, s.sub, M + i * (bw + 2), y, bw, bh))
  y += bh + 5

  // Route + beauty score side by side
  const poly = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number,number])
  const stepP = Math.max(1, Math.ceil(poly.length / 250))
  const sampledPoly = poly.filter((_,i) => i % stepP === 0)

  if (sampledPoly.length > 1) {
    y = sectionBar(doc, 'Tracciato GPS', M, y, W, SKY)
    const mapImg = chartRoute(sampledPoly, 180, 90, '#0369a1')
    if (mapImg) {
      const mapW = hike.cachedBeautyScore ? 105 : W
      doc.addImage(mapImg, 'PNG', M, y, mapW, 43)
      if (hike.cachedBeautyScore) {
        const bs = hike.cachedBeautyScore
        const bc = hexColor(bs.color)
        const sx = M + mapW + 4
        doc.setFillColor(...bc); doc.roundedRect(sx, y+1, 30, 20, 3, 3, 'F')
        txt(doc, bs.overall.toFixed(1), sx+3, y+14, { size: 18, bold: true, color: WHITE })
        txt(doc, '/10 Pagella', sx, y+24, { size: 7.5, color: STONE })
        txt(doc, 'OSM + Wikipedia', sx, y+29, { size: 7, color: STONE })
      }
      y += 46
    }
  }

  // Elevation profile
  const altPts = (hike.trackPoints ?? []).filter(p => p.altitudeMeters !== undefined)
  if (altPts.length > 2) {
    y = sectionBar(doc, 'Profilo Altimetrico', M, y + 1, W, SKY)
    const elevData = Array.from({length: 200}, (_,i) => {
      const idx = Math.min(Math.round(i * (altPts.length-1) / 199), altPts.length-1)
      return altPts[idx].altitudeMeters!
    })
    const eImg = chartLine(elevData, 540, 140, '#0369a1', '#bae6fd')
    if (eImg) {
      doc.addImage(eImg, 'PNG', M, y, W, 35)
      const minA = Math.min(...elevData).toFixed(0), maxA = Math.max(...elevData).toFixed(0)
      txt(doc, `${minA} m`, M, y+37, { size: 7, color: STONE })
      txt(doc, `${maxA} m`, M+W, y+37, { size: 7, color: STONE, align: 'right' })
      y += 40
    }
  }

  // Assessment
  if (hike.assessment) {
    if (y + 50 > 270) { doc.addPage(); y = 14 }
    const a = hike.assessment
    y = sectionBar(doc, 'Valutazione Personalizzata', M, y + 2, W, SKY)

    // Difficulty badge + suitability bar
    const diffColors: Record<string, string> = {
      facile: '#16a34a', moderata: '#d97706', impegnativa: '#ea580c', estrema: '#dc2626',
    }
    const diffLabels: Record<string, string> = {
      facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
    }
    const dc = hexColor(diffColors[a.difficulty] ?? '#78716c')
    doc.setFillColor(...dc); doc.roundedRect(M, y, 28, 7, 2, 2, 'F')
    txt(doc, diffLabels[a.difficulty] ?? a.difficulty, M+2, y+4.8, { size: 8, bold: true, color: WHITE })

    // Suitability bar
    const barX = M + 32, barY = y + 1, barW2 = W - 34, barH2 = 5
    doc.setFillColor(...BORDER); doc.roundedRect(barX, barY, barW2, barH2, 2, 2, 'F')
    const suitColor: [number,number,number] = a.suitabilityScore >= 75 ? [22,163,74] : a.suitabilityScore >= 50 ? [245,158,11] : a.suitabilityScore >= 30 ? [234,88,12] : [220,38,38]
    doc.setFillColor(...suitColor)
    doc.roundedRect(barX, barY, Math.max(4, barW2 * a.suitabilityScore / 100), barH2, 2, 2, 'F')
    txt(doc, `Adatta a te: ${a.suitabilityScore}%`, barX, y+12, { size: 7.5, color: STONE })
    y += 16

    // Risks
    if (a.risks.length > 0) {
      txt(doc, 'Fattori di rischio:', M, y, { size: 7.5, bold: true, color: STONE }); y += 4
      a.risks.slice(0, 6).forEach(r => {
        const ic = r.type === 'danger' ? [239,68,68] as [number,number,number] : r.type === 'warning' ? [245,158,11] as [number,number,number] : [14,165,233] as [number,number,number]
        doc.setFillColor(...ic); doc.circle(M+2, y-0.8, 1.2, 'F')
        const lines = doc.splitTextToSize(r.text, W - 8)
        doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
        doc.text(lines, M+5, y)
        y += lines.length * 4.5
      })
    }
    // Suggestions
    if (a.suggestions.length > 0) {
      y += 2; txt(doc, 'Consigli pratici:', M, y, { size: 7.5, bold: true, color: STONE }); y += 4
      a.suggestions.slice(0, 6).forEach(s => {
        doc.setFillColor(22, 163, 74); doc.circle(M+2, y-0.8, 1.2, 'F')
        const lines = doc.splitTextToSize(s.text, W - 8)
        doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
        doc.text(lines, M+5, y)
        y += lines.length * 4.5
      })
    }
    y += 2
  }

  // Notes
  if (hike.userNotes?.trim()) {
    if (y + 30 > 270) { doc.addPage(); y = 14 }
    y = sectionBar(doc, 'Note Personali', M, y + 2, W, SKY)
    const lines = doc.splitTextToSize(hike.userNotes.trim(), W - 3)
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(...INK)
    doc.text(lines, M, y)
  }

  const dl = hike.plannedDate ? `pianificata il ${format(new Date(hike.plannedDate + 'T12:00'), 'dd/MM/yyyy')}` : 'senza data'
  footer(doc, `Percorso "${hike.title}" · ${dl} · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-pianificato-${hike.title.replace(/\s+/g,'-').replace(/[^a-z0-9-]/gi,'').slice(0,30)}.pdf`)
}

// ── Statistics PDF ─────────────────────────────────────────────────────────────
export async function exportStatsPdf(activities: ActivityMeta[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, W = 182
  let y = 0

  const stats   = computeGlobalStats(activities)
  const records = getPersonalRecords(activities)
  const streaks = computeStreaks(activities)

  // Header
  doc.setFillColor(22, 78, 50); doc.rect(0, 0, 210, 32, 'F')
  txt(doc, 'DTrek', M, 9, { size: 12, bold: true, color: WHITE })
  txt(doc, 'Statistiche & Record Personali', M, 14, { size: 7.5, color: [180, 240, 180] })
  txt(doc, `${activities.length} escursioni · aggiornato ${format(new Date(),'dd/MM/yyyy')}`, M, 27, { size: 8, color: [180, 240, 180] })
  y = 35

  // ── Totals ──────────────────────────────────────────────────────────────────
  y = sectionBar(doc, 'Totali Generali', M, y, W, FOREST)
  const totals = [
    { label: 'Escursioni', value: String(stats.totalActivities) },
    { label: 'Km totali',  value: `${stats.totalDistanceKm.toFixed(1)} km` },
    { label: 'Dislivello', value: `${(stats.totalElevationGain/1000).toFixed(1)} km↑` },
    { label: 'Ore totali', value: `${(stats.totalTimeSeconds/3600).toFixed(0)} h` },
    { label: 'Calorie',    value: `${Math.round(stats.totalCalories/1000)} kcal×10³` },
    { label: 'FC media',   value: `${stats.avgHeartRate} bpm` },
    { label: 'Max distanza', value: `${stats.longestKm.toFixed(1)} km` },
    { label: 'Max quota',  value: `${stats.highestAlt.toFixed(0)} m` },
  ]
  const bw2 = (W - 3*2) / 4, bh2 = 15
  totals.forEach((s, i) => {
    const row = Math.floor(i/4), col = i%4
    statBox(doc, s.label, s.value, undefined, M + col*(bw2+2), y + row*(bh2+2), bw2, bh2)
  })
  y += 2*(bh2+2) + 4

  // ── Streaks ──────────────────────────────────────────────────────────────────
  y = sectionBar(doc, 'Serie & Consistenza', M, y, W, FOREST)
  const stData = [
    { label: 'Serie corrente', value: `${streaks.currentDays} giorni` },
    { label: 'Serie record',   value: `${streaks.longestDays} giorni` },
    { label: 'Sett. corrente', value: `${streaks.currentWeeks} sett.` },
    { label: 'Sett. record',   value: `${streaks.longestWeeks} sett.` },
    { label: 'Giorni attivi',  value: String(streaks.totalActiveDays) },
    { label: 'Sett. attive',   value: String(streaks.totalActiveWeeks) },
  ]
  const bw3 = (W - 5*2) / 6
  stData.forEach((s, i) => statBox(doc, s.label, s.value, undefined, M + i*(bw3+2), y, bw3, 14))
  y += 14 + 5

  // ── Personal records table ───────────────────────────────────────────────────
  y = sectionBar(doc, 'Record Personali', M, y, W, FOREST)
  const recRows = [
    ['Distanza maggiore',  records.longestKm,       (a: ActivityMeta) => `${(a.distanceMeters/1000).toFixed(2)} km`],
    ['Dislivello maggiore', records.highestGain,    (a: ActivityMeta) => `${a.elevationGain.toFixed(0)} m D+`],
    ['Quota massima',      records.highestAlt,       (a: ActivityMeta) => `${a.altitudeMax.toFixed(0)} m slm`],
    ['Durata maggiore',    records.longestDuration,  (a: ActivityMeta) => formatDuration(a.totalTimeSeconds)],
    ['Più calorie',        records.mostCalories,     (a: ActivityMeta) => `${a.calories} kcal`],
    ['FC più alta',        records.highestHR,        (a: ActivityMeta) => `${a.maxHeartRate} bpm`],
  ] as [string, ActivityMeta|null, (a: ActivityMeta) => string][]

  // Table header
  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 6, 'F')
  txt(doc, 'Categoria',   M+2,    y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Valore',      M+65,   y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Escursione',  M+100,  y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Data',        M+160,  y+4.2, { size: 7.5, bold: true, color: FOREST })
  y += 6
  recRows.forEach(([label, activity, valFn], i) => {
    if (!activity) return
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    txt(doc, label,                                  M+2,   y+4, { size: 8 })
    txt(doc, valFn(activity),                        M+65,  y+4, { size: 8, bold: true })
    let aTitle = (activity.title ?? 'Escursione').slice(0, 30)
    txt(doc, aTitle,                                 M+100, y+4, { size: 8 })
    txt(doc, format(new Date(activity.startTime), 'dd/MM/yyyy'), M+160, y+4, { size: 8, color: STONE })
    y += 5.5
  })
  y += 5

  // ── Monthly activity chart ────────────────────────────────────────────────────
  if (y + 50 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Attività Mensili (ultimi 12 mesi)', M, y, W, FOREST)
  const now = new Date()
  const monthlyBars = Array.from({length: 12}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const key = format(d, 'yyyy-MM')
    const label = format(d, 'MMM', { locale: it })
    const count = activities.filter(a => a.startTime.startsWith(key)).length
    return { label, value: count }
  })
  const bImg = chartBar(monthlyBars, 540, 160, '#16a34a')
  if (bImg) { doc.addImage(bImg, 'PNG', M, y, W, 38); y += 41 }

  // ── Year-by-year chart ────────────────────────────────────────────────────────
  if (y + 45 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Anno per Anno', M, y, W, FOREST)
  const yearMap = new Map<number, number>()
  activities.forEach(a => {
    const yr = new Date(a.startTime).getFullYear()
    yearMap.set(yr, (yearMap.get(yr) ?? 0) + 1)
  })
  const yearBars = Array.from(yearMap.entries()).sort((a,b) => a[0]-b[0]).map(([yr, cnt]) => ({ label: String(yr), value: cnt }))
  const yImg = chartBar(yearBars, 540, 160, '#0369a1')
  if (yImg) { doc.addImage(yImg, 'PNG', M, y, W, 38); y += 41 }

  // ── Top activities table ──────────────────────────────────────────────────────
  if (y + 40 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Top 10 per Distanza', M, y, W, FOREST)
  const top10 = [...activities].sort((a,b) => b.distanceMeters - a.distanceMeters).slice(0, 10)
  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 6, 'F')
  txt(doc, '#',       M+2,   y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Titolo',  M+10,  y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Data',    M+95,  y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Km',      M+123, y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'D+',      M+141, y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Durata',  M+157, y+4.2, { size: 7.5, bold: true, color: FOREST })
  y += 6
  top10.forEach((a, i) => {
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    txt(doc, String(i+1),                         M+2,   y+4, { size: 8, bold: true, color: FOREST })
    let t = (a.title ?? 'Escursione').slice(0, 35)
    txt(doc, t,                                    M+10,  y+4, { size: 8 })
    txt(doc, format(new Date(a.startTime), 'dd/MM/yyyy'), M+95, y+4, { size: 8 })
    txt(doc, `${(a.distanceMeters/1000).toFixed(1)}`,     M+123, y+4, { size: 8, bold: true, color: FOREST })
    txt(doc, `${a.elevationGain.toFixed(0)} m`,           M+141, y+4, { size: 8 })
    txt(doc, formatDuration(a.totalTimeSeconds),           M+157, y+4, { size: 8 })
    y += 5.5
  })

  footer(doc, `Statistiche DTrek · ${activities.length} escursioni · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-statistiche-${format(new Date(),'yyyyMMdd')}.pdf`)
}

// ── All-routes map PDF ─────────────────────────────────────────────────────────
export async function exportMapPdf(activities: ActivityMeta[]): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  // A4 landscape: 297 × 210 mm
  const M = 14, W = 297 - 2*M

  // Header
  doc.setFillColor(...FOREST); doc.rect(0, 0, 297, 25, 'F')
  txt(doc, 'DTrek', M, 9, { size: 12, bold: true, color: WHITE })
  txt(doc, 'Mappa di tutti i percorsi', M, 14, { size: 7.5, color: [180, 240, 180] })
  txt(doc, `${activities.length} escursioni · generato ${format(new Date(),'dd/MM/yyyy')}`, M, 20, { size: 8, color: [180, 240, 180] })

  // Map image
  const mapImg = chartAllRoutes(activities, 840, 500)
  if (mapImg) {
    doc.addImage(mapImg, 'PNG', M, 28, W, 154)
  } else {
    txt(doc, 'Nessun tracciato GPS disponibile', M, 80, { size: 12, color: STONE })
  }

  // Activity list on page 2
  doc.addPage()
  let y = M
  y = sectionBar(doc, `Elenco Escursioni (${activities.length})`, M, y, W, FOREST)

  // Table header
  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 6, 'F')
  const cols2 = [
    { h: 'N.',      x: M,     w: 9  },
    { h: 'Data',    x: M+10,  w: 24 },
    { h: 'Titolo',  x: M+35,  w: 90 },
    { h: 'Km',      x: M+127, w: 18 },
    { h: 'D+',      x: M+147, w: 22 },
    { h: 'Durata',  x: M+171, w: 28 },
    { h: 'FC',      x: M+201, w: 24 },
    { h: 'Voto',    x: M+227, w: 16 },
    { h: 'Distanza',x: M+245, w: 24 },
  ]
  cols2.forEach(col => txt(doc, col.h, col.x+1, y+4.2, { size: 7.5, bold: true, color: FOREST }))
  y += 6

  const sorted = [...activities].sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  sorted.forEach((a, i) => {
    if (y > 190) { doc.addPage(); y = M }
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    const cells = [
      String(i+1),
      format(new Date(a.startTime), 'dd/MM/yy'),
      (a.title ?? 'Escursione').slice(0, 38),
      `${(a.distanceMeters/1000).toFixed(1)}`,
      `${a.elevationGain.toFixed(0)} m`,
      formatDuration(a.totalTimeSeconds),
      `${a.avgHeartRate} bpm`,
      a.userRating ? `★${a.userRating}` : '—',
      `${a.altitudeMax.toFixed(0)} m`,
    ]
    cols2.forEach((col, ci) => txt(doc, cells[ci], col.x+1, y+4, { size: 7.5 }))
    y += 5.5
  })

  footer(doc, `Mappa DTrek · ${activities.length} percorsi · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-mappa-${format(new Date(),'yyyyMMdd')}.pdf`)
}
