/**
 * DTrek PDF export — jsPDF + inline Canvas charts + MapTiler satellite tiles.
 */

import { format } from 'date-fns'
import { it }     from 'date-fns/locale'
import type { StoredActivity, ActivityMeta } from '@/lib/blobStore'
import type { PlannedHike }                  from '@/lib/plannedStore'
import type { PoiItem }                      from '@/lib/overpass'
import type { WikiPage }                     from '@/lib/wikipedia'
import { formatDuration, msToKmh }           from '@/lib/tcxParser'
import { getPersonalRecords, computeStreaks } from '@/lib/stats'
import { computeGlobalStats }                from '@/lib/blobStore'

// ── Brand palette ──────────────────────────────────────────────────────────────
const FOREST  = [22,  101,  52] as [number, number, number]
const SKY     = [3,   105, 161] as [number, number, number]
const STONE50 = [250, 250, 249] as [number, number, number]
const STONE   = [120, 113, 108] as [number, number, number]
const INK     = [28,   25,  23] as [number, number, number]
const BORDER  = [228, 228, 231] as [number, number, number]
const WHITE   = [255, 255, 255] as [number, number, number]

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Strip emoji and non-latin characters that jsPDF Helvetica can't render */
function safeText(s: string): string {
  // Remove characters outside latin-1 range that jsPDF Helvetica can't render
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x00-\xFF]/g, '').trim()
}

function hexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

// ── Canvas chart helpers ────────────────────────────────────────────────────────

function mkCanvas(w: number, h: number, scale = 2) {
  const c = document.createElement('canvas')
  c.width = w * scale; c.height = h * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  return { c, ctx }
}

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

  ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, w, h)

  const pts = data.map((v, i): [number, number] => [
    pad + (i / (data.length - 1)) * (w - 2 * pad),
    h - pad - ((v - minV) / range) * (h - 2 * pad),
  ])

  ctx.beginPath()
  ctx.moveTo(pts[0][0], h - pad)
  pts.forEach(([x, y]) => ctx.lineTo(x, y))
  ctx.lineTo(pts[pts.length - 1][0], h - pad)
  ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()

  ctx.beginPath()
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.strokeStyle = line; ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'; ctx.stroke()

  return c.toDataURL('image/png')
}

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

/** Fallback vector route (white background) */
function chartRouteFallback(
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

  ctx.fillStyle = '#f0f9ff'
  if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(0, 0, w, h, 6); ctx.fill() }
  else ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.beginPath()
  pts.forEach(([lat, lon], i) => i === 0 ? ctx.moveTo(px(lon), py(lat)) : ctx.lineTo(px(lon), py(lat)))
  ctx.stroke()

  const dot = (lat: number, lon: number, col: string) => {
    ctx.beginPath(); ctx.arc(px(lon), py(lat), 5, 0, Math.PI * 2)
    ctx.fillStyle = col; ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
  }
  dot(pts[0][0], pts[0][1], '#22c55e')
  dot(pts[pts.length-1][0], pts[pts.length-1][1], '#ef4444')

  return c.toDataURL('image/png')
}

// ── Satellite map with route overlay ───────────────────────────────────────────

const TILE_SIZE = 256

function latLonToXY(lat: number, lon: number, z: number) {
  const n = Math.pow(2, z)
  const latRad = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  }
}

function loadTileImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/**
 * Fetch MapTiler satellite tiles, stitch them, draw the route polyline on top.
 * Falls back to plain vector route on any error.
 */
async function fetchSatMap(
  pts: [number, number][],  // [lat, lon]
  outW: number,
  outH: number,
  lineColor: string,
): Promise<string> {
  const KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''
  if (!KEY || pts.length < 2) return chartRouteFallback(pts, outW, outH, lineColor)

  try {
    const lats = pts.map(p => p[0])
    const lons = pts.map(p => p[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const padFrac = 0.18
    const padLat = (maxLat - minLat) * padFrac || 0.003
    const padLon = (maxLon - minLon) * padFrac || 0.003
    const bMinLat = minLat - padLat, bMaxLat = maxLat + padLat
    const bMinLon = minLon - padLon, bMaxLon = maxLon + padLon

    // Find best zoom where total tiles <= 30
    let zoom = 16
    for (let z = 16; z >= 9; z--) {
      const tl = latLonToXY(bMaxLat, bMinLon, z)
      const br = latLonToXY(bMinLat, bMaxLon, z)
      const tw = Math.floor(br.x) - Math.floor(tl.x) + 1
      const th = Math.floor(br.y) - Math.floor(tl.y) + 1
      if (tw * th <= 30) { zoom = z; break }
    }

    const tl = latLonToXY(bMaxLat, bMinLon, zoom)
    const br = latLonToXY(bMinLat, bMaxLon, zoom)
    const minTX = Math.floor(tl.x), maxTX = Math.floor(br.x)
    const minTY = Math.floor(tl.y), maxTY = Math.floor(br.y)
    const tilesW = maxTX - minTX + 1
    const tilesH = maxTY - minTY + 1

    // Full stitched canvas (all tiles)
    const full = document.createElement('canvas')
    full.width = tilesW * TILE_SIZE
    full.height = tilesH * TILE_SIZE
    const fctx = full.getContext('2d')!

    // Fetch and draw tiles
    await Promise.all(
      Array.from({ length: tilesW * tilesH }, (_, idx) => {
        const tx = minTX + (idx % tilesW)
        const ty = minTY + Math.floor(idx / tilesW)
        const url = `https://api.maptiler.com/tiles/satellite/${zoom}/${tx}/${ty}.jpg?key=${KEY}`
        return loadTileImage(url)
          .then(img => fctx.drawImage(img, (tx - minTX) * TILE_SIZE, (ty - minTY) * TILE_SIZE))
          .catch(() => {
            fctx.fillStyle = '#1a2a3a'
            fctx.fillRect((tx - minTX) * TILE_SIZE, (ty - minTY) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          })
      })
    )

    // Project lat/lon → full-canvas pixel
    const project = (lat: number, lon: number) => {
      const xy = latLonToXY(lat, lon, zoom)
      return { x: (xy.x - minTX) * TILE_SIZE, y: (xy.y - minTY) * TILE_SIZE }
    }

    // Draw route shadow then line
    const lineW = Math.max(4, Math.min(8, full.width / 120))
    fctx.lineCap = 'round'; fctx.lineJoin = 'round'

    fctx.strokeStyle = 'rgba(0,0,0,0.55)'; fctx.lineWidth = lineW + 3
    fctx.shadowColor = 'transparent'
    fctx.beginPath()
    pts.forEach(([lat, lon], i) => {
      const { x, y } = project(lat, lon)
      i === 0 ? fctx.moveTo(x, y) : fctx.lineTo(x, y)
    })
    fctx.stroke()

    fctx.strokeStyle = lineColor; fctx.lineWidth = lineW
    fctx.beginPath()
    pts.forEach(([lat, lon], i) => {
      const { x, y } = project(lat, lon)
      i === 0 ? fctx.moveTo(x, y) : fctx.lineTo(x, y)
    })
    fctx.stroke()

    // Start / end dots
    const drawDot = (lat: number, lon: number, fill: string) => {
      const { x, y } = project(lat, lon)
      const r = lineW * 1.8
      fctx.beginPath(); fctx.arc(x, y, r, 0, Math.PI * 2)
      fctx.fillStyle = fill; fctx.fill()
      fctx.strokeStyle = '#fff'; fctx.lineWidth = r * 0.45; fctx.stroke()
    }
    drawDot(pts[0][0], pts[0][1], '#22c55e')
    drawDot(pts[pts.length-1][0], pts[pts.length-1][1], '#ef4444')

    // Crop to bbox + draw onto output canvas
    const topLeft  = project(bMaxLat, bMinLon)
    const botRight = project(bMinLat, bMaxLon)
    const cropX = Math.max(0, topLeft.x), cropY = Math.max(0, topLeft.y)
    const cropW = Math.min(full.width,  botRight.x) - cropX
    const cropH = Math.min(full.height, botRight.y) - cropY

    const out = document.createElement('canvas')
    out.width = outW; out.height = outH
    const octx = out.getContext('2d')!
    octx.drawImage(full, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

    return out.toDataURL('image/jpeg', 0.93)
  } catch {
    return chartRouteFallback(pts, outW, outH, lineColor)
  }
}

/** All routes combined (stats map page) */
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

function txt(
  doc: Doc, str: string, x: number, y: number,
  { size = 9, bold = false, color = INK, align = 'left' as 'left' | 'center' | 'right' } = {},
) {
  doc.setFontSize(size)
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setTextColor(...color)
  doc.text(safeText(str), x, y, { align })
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
  doc.setDrawColor(...BORDER);  doc.roundedRect(x, y, w, h, 2, 2, 'S')
  txt(doc, label, x + 2.5, y + 4,   { size: 6.5, color: STONE })
  txt(doc, value, x + 2.5, y + 9.5, { size: 9.5, bold: true })
  if (sub) txt(doc, sub, x + 2.5, y + 13, { size: 6.5, color: STONE })
}

function footer(doc: Doc, label: string) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 180)
    doc.text(safeText(label), 14, 291)
    doc.text(`Pagina ${i} di ${n}  DTrek`, 196, 291, { align: 'right' })
  }
}

/** Render POIs section, return new y */
function renderPois(
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
    y = sectionBar(doc, 'Mappa Satellitare', M, y, W, FOREST)
    const mapH = 55  // mm
    const mapImg = await fetchSatMap(poly, 1440, Math.round(1440 * mapH / W), '#22c55e')
    if (mapImg) {
      doc.addImage(mapImg, 'JPEG', M, y, W, mapH)
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
    y = sectionBar(doc, 'Mappa Satellitare', M, y, W, SKY)
    const mapH = 55
    const mapImg = await fetchSatMap(sampledPoly, 1440, Math.round(1440 * mapH / W), '#38bdf8')

    {
      doc.addImage(mapImg, 'JPEG', M, y, W, mapH)
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

// ── Guide PDF ──────────────────────────────────────────────────────────────────
export async function exportGuidePdf(hike: PlannedHike, guideText: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 14, W = 182
  const AMBER:       [number,number,number] = [180,  83,  9]
  const AMBER_SOFT:  [number,number,number] = [254, 215, 170]
  let y = 0

  // Section color mapping (mirrors frontend)
  const GUIDE_COLORS: Record<string, [number,number,number]> = {
    'prima di partire': [217, 119,   6],
    'il percorso':      [ 22, 163,  74],
    'i luoghi':         [124,  58, 237],
    'la natura':        [ 15, 118, 110],
    'sapori':           [180,  83,   9],
    'consigli':         [  3, 105, 161],
  }
  function guideColor(title: string): [number,number,number] {
    const key = title.toLowerCase()
    for (const [k, v] of Object.entries(GUIDE_COLORS)) {
      if (key.includes(k)) return v
    }
    return STONE
  }

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.setFillColor(...AMBER); doc.rect(0, 0, 210, 32, 'F')
  txt(doc, 'DTrek', M, 9, { size: 12, bold: true, color: WHITE })
  txt(doc, 'Guida Escursionistica — Giulia', M, 14, { size: 7.5, color: AMBER_SOFT })
  let ttl = safeText(hike.title)
  doc.setFontSize(17); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
  while (doc.getTextWidth(ttl) > W - 5 && ttl.length > 4) ttl = ttl.slice(0, -4) + '…'
  doc.text(ttl, M, 24)
  y = 35

  if (hike.plannedDate) {
    const dl = format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })
    txt(doc, dl, M, y, { size: 8.5, color: STONE }); y += 6
  }

  // ── Stats boxes ──────────────────────────────────────────────────────────────
  y = sectionBar(doc, 'Il Percorso', M, y + 1, W, AMBER)
  const gStats = [
    { label: 'Distanza',      value: `${(hike.distanceMeters/1000).toFixed(1)} km` },
    { label: 'Dislivello +',  value: `${Math.round(hike.elevationGain)} m` },
    { label: 'Quota massima', value: `${Math.round(hike.altitudeMax)} m slm` },
    { label: 'Durata stimata',value: formatDuration(hike.estimatedTimeSeconds) },
  ]
  const bw = (W - 3 * 2) / 4, bh = 14
  gStats.forEach((s, i) => statBox(doc, s.label, s.value, undefined, M + i * (bw + 2), y, bw, bh))
  y += bh + 4

  // ── Satellite map ─────────────────────────────────────────────────────────────
  const pts = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number,number])
  const step = Math.max(1, Math.ceil(pts.length / 300))
  const sampled = pts.length > 1 ? pts.filter((_, i) => i % step === 0) : (hike.routePolyline ?? []) as [number,number][]

  if (sampled.length > 1) {
    const mapH = 58
    const mapImg = await fetchSatMap(sampled, 1440, Math.round(1440 * mapH / W), '#f59e0b')
    if (mapImg) { doc.addImage(mapImg, 'JPEG', M, y, W, mapH); y += mapH + 4 }
  }

  // ── Guide sections ────────────────────────────────────────────────────────────
  const parts = guideText.split(/^## /m).filter(Boolean)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body  = nl === -1 ? '' : part.slice(nl + 1).trim()
    if (!title) continue

    const sc = guideColor(title)
    if (y + 20 > 272) { doc.addPage(); y = 14 }
    y = sectionBar(doc, safeText(title), M, y + 3, W, sc)

    const paras = body.split(/\n+/).filter(Boolean)
    for (const para of paras) {
      const lines = doc.splitTextToSize(safeText(para), W - 2)
      const needed = lines.length * 4.5 + 2
      if (y + needed > 278) { doc.addPage(); y = 14 }
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK)
      doc.text(lines, M, y)
      y += needed
    }
    y += 2
  }

  // ── POI reference list ────────────────────────────────────────────────────────
  const wikiEntries = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const rawPois     = (hike.cachedPois   ?? []) as PoiItem[]
  if (wikiEntries.length > 0 || rawPois.length > 0) {
    if (y + 40 > 272) { doc.addPage(); y = 14 }
    y = renderPois(doc, wikiEntries, rawPois, M, W, y + 3, AMBER)
  }

  footer(doc, `Guida "${safeText(hike.title)}" · generata il ${format(new Date(), 'dd/MM/yyyy HH:mm')} · DTrek`)
  doc.save(`dtrek-guida-${hike.title.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').slice(0, 30)}.pdf`)
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
  txt(doc, 'Statistiche & Record Personali', M, 14, { size: 7.5, color: [180, 240, 180] as [number,number,number] })
  txt(doc, `${activities.length} escursioni · aggiornato ${format(new Date(),'dd/MM/yyyy')}`, M, 27, { size: 8, color: [180, 240, 180] as [number,number,number] })
  y = 35

  // Totals grid
  y = sectionBar(doc, 'Totali Generali', M, y, W, FOREST)
  const totals = [
    { label: 'Escursioni',   value: String(stats.totalActivities) },
    { label: 'Km totali',    value: `${stats.totalDistanceKm.toFixed(1)} km` },
    { label: 'Dislivello',   value: `${(stats.totalElevationGain/1000).toFixed(1)} km su` },
    { label: 'Ore totali',   value: `${(stats.totalTimeSeconds/3600).toFixed(0)} h` },
    { label: 'Calorie',      value: `${Math.round(stats.totalCalories/1000)} kcal x1000` },
    { label: 'FC media',     value: `${stats.avgHeartRate} bpm` },
    { label: 'Max distanza', value: `${stats.longestKm.toFixed(1)} km` },
    { label: 'Max quota',    value: `${stats.highestAlt.toFixed(0)} m` },
  ]
  const bw2 = (W - 3*2) / 4, bh2 = 15
  totals.forEach((s, i) => statBox(doc, s.label, s.value, undefined, M+(i%4)*(bw2+2), y+Math.floor(i/4)*(bh2+2), bw2, bh2))
  y += 2*(bh2+2) + 4

  // Streaks
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

  // Personal records table
  y = sectionBar(doc, 'Record Personali', M, y, W, FOREST)
  const recRows = [
    ['Distanza maggiore',  records.longestKm,       (a: ActivityMeta) => `${(a.distanceMeters/1000).toFixed(2)} km`],
    ['Dislivello maggiore',records.highestGain,      (a: ActivityMeta) => `${a.elevationGain.toFixed(0)} m D+`],
    ['Quota massima',      records.highestAlt,       (a: ActivityMeta) => `${a.altitudeMax.toFixed(0)} m slm`],
    ['Durata maggiore',    records.longestDuration,  (a: ActivityMeta) => formatDuration(a.totalTimeSeconds)],
    ['Piu calorie',        records.mostCalories,     (a: ActivityMeta) => `${a.calories} kcal`],
    ['FC piu alta',        records.highestHR,        (a: ActivityMeta) => `${a.maxHeartRate} bpm`],
  ] as [string, ActivityMeta|null, (a: ActivityMeta) => string][]

  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 6, 'F')
  txt(doc, 'Categoria',  M+2,   y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Valore',     M+65,  y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Escursione', M+100, y+4.2, { size: 7.5, bold: true, color: FOREST })
  txt(doc, 'Data',       M+160, y+4.2, { size: 7.5, bold: true, color: FOREST })
  y += 6
  recRows.forEach(([label, act, valFn], i) => {
    if (!act) return
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    txt(doc, label, M+2, y+4, { size: 8 })
    txt(doc, valFn(act), M+65, y+4, { size: 8, bold: true })
    txt(doc, safeText((act.title ?? 'Escursione').slice(0, 30)), M+100, y+4, { size: 8 })
    txt(doc, format(new Date(act.startTime), 'dd/MM/yyyy'), M+160, y+4, { size: 8, color: STONE })
    y += 5.5
  })
  y += 5

  // Monthly bar chart
  if (y + 50 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Attivita Mensili (ultimi 12 mesi)', M, y, W, FOREST)
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

  // Year bar chart
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

  // Top 10 table
  if (y + 40 > 270) { doc.addPage(); y = 14 }
  y = sectionBar(doc, 'Top 10 per Distanza', M, y, W, FOREST)
  const top10 = [...activities].sort((a,b) => b.distanceMeters - a.distanceMeters).slice(0, 10)
  doc.setFillColor(220, 252, 231); doc.rect(M, y, W, 5.5, 'F')
  const cols2 = [
    { h: 'N.',     x: M,     w: 9  },
    { h: 'Data',   x: M+10,  w: 24 },
    { h: 'Titolo', x: M+35,  w: 90 },
    { h: 'Km',     x: M+127, w: 18 },
    { h: 'D+',     x: M+147, w: 22 },
    { h: 'Quota',  x: M+172, w: 24 },
  ]
  cols2.forEach(col => txt(doc, col.h, col.x+1, y+4, { size: 7.5, bold: true, color: FOREST }))
  y += 5.5
  top10.forEach((a, i) => {
    if (y > 280) { doc.addPage(); y = 14 }
    if (i%2===0) { doc.setFillColor(...STONE50); doc.rect(M, y, W, 5.5, 'F') }
    const cells = [
      String(i+1),
      format(new Date(a.startTime), 'dd/MM/yy'),
      safeText(a.title ?? 'Escursione').slice(0, 38),
      `${(a.distanceMeters/1000).toFixed(1)} km`,
      `${a.elevationGain.toFixed(0)} m`,
      `${a.altitudeMax.toFixed(0)} m`,
    ]
    cols2.forEach((col, ci) => txt(doc, cells[ci], col.x+1, y+4, { size: 7.5 }))
    y += 5.5
  })

  footer(doc, `Statistiche DTrek · ${activities.length} escursioni · generato il ${format(new Date(),'dd/MM/yyyy HH:mm')}`)
  doc.save(`dtrek-statistiche-${format(new Date(),'yyyyMMdd')}.pdf`)
}

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
