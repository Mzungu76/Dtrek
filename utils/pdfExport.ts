/**
 * DTrek PDF export — jsPDF + inline Canvas charts + OpenStreetMap tiles.
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

/**
 * Draw a cropped region of `src` onto a new outW×outH canvas, scaling
 * uniformly (preserving aspect ratio) and letterboxing with white bars
 * instead of stretching non-uniformly to fill the target box.
 */
function drawLetterboxed(
  src: HTMLCanvasElement,
  cropX: number, cropY: number, cropW: number, cropH: number,
  outW: number, outH: number,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = outW; out.height = outH
  const octx = out.getContext('2d')!
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, outW, outH)
  if (cropW > 0 && cropH > 0) {
    const scale = Math.min(outW / cropW, outH / cropH)
    const drawW = cropW * scale, drawH = cropH * scale
    const dx = (outW - drawW) / 2, dy = (outH - drawH) / 2
    octx.drawImage(src, cropX, cropY, cropW, cropH, dx, dy, drawW, drawH)
  }
  return out
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
 * Fetch OpenStreetMap tiles, stitch them, draw the route polyline on top.
 * Falls back to plain vector route on any error.
 */
export async function fetchSatMap(
  pts: [number, number][],  // [lat, lon]
  outW: number,
  outH: number,
  lineColor: string,
): Promise<string> {
  if (pts.length < 2) return chartRouteFallback(pts, outW, outH, lineColor)

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
        const url = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`
        return loadTileImage(url)
          .then(img => fctx.drawImage(img, (tx - minTX) * TILE_SIZE, (ty - minTY) * TILE_SIZE))
          .catch(() => {
            fctx.fillStyle = '#e8e8e8'
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

    const out = drawLetterboxed(full, cropX, cropY, cropW, cropH, outW, outH)

    return out.toDataURL('image/png')
  } catch {
    return chartRouteFallback(pts, outW, outH, lineColor)
  }
}

/**
 * All routes combined, with a real OSM tile basemap underneath (used for the
 * diario PDF export, where the live Leaflet map can't be captured — canvases
 * tainted by cross-origin tiles get stripped before html2canvas runs).
 * Falls back to the flat vector-only rendering on any tile-fetch error.
 */
export async function fetchAllRoutesSatMap(activities: ActivityMeta[], outW: number, outH: number): Promise<string> {
  const polylines = activities.filter(a => (a.routePolyline?.length ?? 0) > 1).map(a => a.routePolyline!)
  if (!polylines.length) return ''

  try {
    const allPts = polylines.flat()
    const lats = allPts.map(p => p[0]), lons = allPts.map(p => p[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const padFrac = 0.12
    const padLat = (maxLat - minLat) * padFrac || 0.003
    const padLon = (maxLon - minLon) * padFrac || 0.003
    const bMinLat = minLat - padLat, bMaxLat = maxLat + padLat
    const bMinLon = minLon - padLon, bMaxLon = maxLon + padLon

    let zoom = 16
    for (let z = 16; z >= 6; z--) {
      const tl = latLonToXY(bMaxLat, bMinLon, z)
      const br = latLonToXY(bMinLat, bMaxLon, z)
      const tw = Math.floor(br.x) - Math.floor(tl.x) + 1
      const th = Math.floor(br.y) - Math.floor(tl.y) + 1
      if (tw * th <= 40) { zoom = z; break }
    }

    const tl = latLonToXY(bMaxLat, bMinLon, zoom)
    const br = latLonToXY(bMinLat, bMaxLon, zoom)
    const minTX = Math.floor(tl.x), maxTX = Math.floor(br.x)
    const minTY = Math.floor(tl.y), maxTY = Math.floor(br.y)
    const tilesW = maxTX - minTX + 1
    const tilesH = maxTY - minTY + 1

    const full = document.createElement('canvas')
    full.width = tilesW * TILE_SIZE
    full.height = tilesH * TILE_SIZE
    const fctx = full.getContext('2d')!

    await Promise.all(
      Array.from({ length: tilesW * tilesH }, (_, idx) => {
        const tx = minTX + (idx % tilesW)
        const ty = minTY + Math.floor(idx / tilesW)
        const url = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`
        return loadTileImage(url)
          .then(img => fctx.drawImage(img, (tx - minTX) * TILE_SIZE, (ty - minTY) * TILE_SIZE))
          .catch(() => {
            fctx.fillStyle = '#e8e8e8'
            fctx.fillRect((tx - minTX) * TILE_SIZE, (ty - minTY) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
          })
      })
    )

    const project = (lat: number, lon: number) => {
      const xy = latLonToXY(lat, lon, zoom)
      return { x: (xy.x - minTX) * TILE_SIZE, y: (xy.y - minTY) * TILE_SIZE }
    }

    const PALETTE = ['#166534','#0369a1','#9333ea','#c2410c','#0f766e','#b45309','#be123c','#1d4ed8']
    const lineW = Math.max(3, Math.min(6, full.width / 160))
    fctx.lineCap = 'round'; fctx.lineJoin = 'round'

    polylines.forEach(pl => {
      fctx.strokeStyle = 'rgba(0,0,0,0.45)'; fctx.lineWidth = lineW + 2
      fctx.beginPath()
      pl.forEach(([lat, lon], i) => {
        const { x, y } = project(lat, lon)
        i === 0 ? fctx.moveTo(x, y) : fctx.lineTo(x, y)
      })
      fctx.stroke()
    })
    polylines.forEach((pl, idx) => {
      fctx.strokeStyle = PALETTE[idx % PALETTE.length]; fctx.lineWidth = lineW
      fctx.beginPath()
      pl.forEach(([lat, lon], i) => {
        const { x, y } = project(lat, lon)
        i === 0 ? fctx.moveTo(x, y) : fctx.lineTo(x, y)
      })
      fctx.stroke()
    })

    const topLeft  = project(bMaxLat, bMinLon)
    const botRight = project(bMinLat, bMaxLon)
    const cropX = Math.max(0, topLeft.x), cropY = Math.max(0, topLeft.y)
    const cropW = Math.min(full.width,  botRight.x) - cropX
    const cropH = Math.min(full.height, botRight.y) - cropY

    const out = drawLetterboxed(full, cropX, cropY, cropW, cropH, outW, outH)

    return out.toDataURL('image/png')
  } catch {
    return chartAllRoutes(activities, outW, outH)
  }
}

/** All routes combined (stats map page) — flat vector fallback, no tiles */
export function chartAllRoutes(activities: ActivityMeta[], w: number, h: number): string {
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

// ── Guide PDF (Magazine Layout) ────────────────────────────────────────────────

/** Fetch a Wikipedia thumbnail URL → canvas JPEG data-URL (browser context) */
async function fetchWikiThumb(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), 5000)
    img.onload = () => {
      clearTimeout(timer)
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      c.getContext('2d')!.drawImage(img, 0, 0)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

function createGradientOverlay(widthPx: number, heightPx: number): string {
  const c = document.createElement('canvas')
  c.width = widthPx; c.height = heightPx
  const ctx = c.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 0, heightPx)
  grad.addColorStop(0,    'rgba(0,0,0,0)')
  grad.addColorStop(0.35, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1,    'rgba(0,0,0,0.92)')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, widthPx, heightPx)
  return c.toDataURL('image/png')
}

export async function exportGuidePdf(hike: PlannedHike, guideText: string): Promise<void> {
  const { exportGuidePdfHtml } = await import('@/app/lib/guide/usePDFExport')
  return exportGuidePdfHtml(hike, guideText)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _exportGuidePdfLegacy(hike: PlannedHike, guideText: string): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // ── Layout constants ──────────────────────────────────────────────────────────
  const M = 14, W = 182, PAGE_H = 297
  const GAP = 6, COL_W = (W - GAP) / 2
  const LEFT_X = M, RIGHT_X = M + COL_W + GAP
  const CONTENT_TOP = 13, CONTENT_BOTTOM = 284
  const LINE_H = 4.8, PARA_GAP = 2.5
  const COVER_MAP_H = 182, COVER_GRAD_H = 90

  // ── Colors ────────────────────────────────────────────────────────────────────
  const AMBER:      [number,number,number] = [180,  83,   9]
  const AMBER_SOFT: [number,number,number] = [254, 215, 170]
  const AMBER_BG:   [number,number,number] = [255, 237, 213]

  // ── POI data — declared early to allow thumbnail pre-fetch ────────────────────
  const wikiEntries = (hike.cachedPoiWiki ?? []) as { poi: PoiItem; wiki: WikiPage }[]
  const rawPois     = (hike.cachedPois   ?? []) as PoiItem[]

  // Pre-fetch Wikipedia thumbnails concurrently (silent failures accepted)
  const thumbs = new Map<number, string>()
  await Promise.allSettled(
    wikiEntries
      .filter(e => e.wiki.thumbnail)
      .map(async e => {
        const img = await fetchWikiThumb(e.wiki.thumbnail!)
        if (img) thumbs.set(e.wiki.pageid, img)
      }),
  )

  // ── Section color mapping ─────────────────────────────────────────────────────
  const GUIDE_COLORS: Record<string, [number,number,number]> = {
    'prima di partire': [217, 119,   6],
    'il percorso':      [ 22, 163,  74],
    'i luoghi':         [124,  58, 237],
    'la natura':        [ 15, 118, 110],
    'sapori':           [180,  83,   9],
    'consigli':         [  3, 105, 161],
  }
  function guideColor(t: string): [number,number,number] {
    const k = t.toLowerCase()
    for (const [kk, v] of Object.entries(GUIDE_COLORS)) if (k.includes(kk)) return v
    return STONE
  }

  // ── POI type labels and badge colors ─────────────────────────────────────────
  const POI_LABELS: Record<string, string> = {
    peak: 'Cima', hut: 'Rifugio', bivouac: 'Bivacco', spring: 'Sorgente',
    viewpoint: 'Belvedere', cross: 'Croce', pass: 'Valico', waterfall: 'Cascata',
    cave: 'Grotta', shelter: 'Riparo', ruins: 'Rovine', archaeological: 'Sito arch.',
    castle: 'Castello', fountain: 'Fontana', chapel: 'Cappella',
    tower: 'Torre', monument: 'Monumento',
  }
  const POI_COLORS: Record<string, [number,number,number]> = {
    peak:          [ 99,  74, 204],
    hut:           [ 22, 101,  52],
    bivouac:       [ 22, 101,  52],
    castle:        [124,  58, 237],
    archaeological:[120,  53,  15],
    ruins:         [120,  53,  15],
    waterfall:     [  3, 105, 161],
    cave:          [ 68,  64,  60],
    viewpoint:     [ 15, 118, 110],
  }

  // ── Markdown parser ───────────────────────────────────────────────────────────
  type GEl =
    | { type: 'section-header'; title: string; color: [number,number,number] }
    | { type: 'subsection';     title: string }
    | { type: 'curiosita';      text:  string }
    | { type: 'paragraph';      text:  string; isLead: boolean }

  function parseBodyInto(body: string, els: GEl[]) {
    const cRe = /\[curiosita\]([\s\S]*?)\[\/curiosita\]/g
    let last = 0, m: RegExpExecArray | null
    let firstPara = true
    const flushText = (chunk: string) => {
      let buf: string[] = []
      const flush = () => {
        const p = buf.join(' ').trim()
        if (p) { els.push({ type: 'paragraph', text: p, isLead: firstPara }); firstPara = false }
        buf = []
      }
      for (const l of chunk.split('\n')) {
        const t = l.trim()
        if (t.startsWith('### ')) { flush(); els.push({ type: 'subsection', title: t.slice(4).trim() }) }
        else if (!t) flush()
        else buf.push(t)
      }
      flush()
    }
    while ((m = cRe.exec(body)) !== null) {
      flushText(body.slice(last, m.index))
      els.push({ type: 'curiosita', text: m[1].trim().replace(/\n/g, ' ') })
      firstPara = false
      last = m.index + m[0].length
    }
    flushText(body.slice(last))
  }

  const elements: GEl[] = []
  for (const part of guideText.split(/^## /m).filter(Boolean)) {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body  = nl === -1 ? '' : part.slice(nl + 1)
    if (!title) continue
    elements.push({ type: 'section-header', title, color: guideColor(title) })
    parseBodyInto(body, elements)
  }

  // ── Magazine helpers ──────────────────────────────────────────────────────────

  // Running header: amber top rule, DTrek left, guide title centered
  function addRunningHeader(title: string) {
    doc.setFillColor(...AMBER);       doc.rect(0, 0, 210, 1.5, 'F')
    doc.setFillColor(255, 255, 255);  doc.rect(0, 1.5, 210, 9.5, 'F')
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.25); doc.line(0, 11, 210, 11)
    txt(doc, 'DTrek', M, 8, { size: 7, bold: true, color: AMBER })
    let hTitle = safeText(title)
    doc.setFontSize(6); doc.setFont('helvetica', 'normal')
    while (hTitle.length > 8 && doc.getTextWidth(hTitle) > 126) hTitle = hTitle.slice(0, -3) + '...'
    txt(doc, hTitle, 105, 8, { size: 6, color: STONE, align: 'center' })
    const divX = LEFT_X + COL_W + GAP / 2
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.2)
    doc.line(divX, CONTENT_TOP + 1, divX, CONTENT_BOTTOM)
  }

  // Full-width section band: dark accent left bar + colored band
  function magSectionHeader(title: string, color: [number,number,number], y: number): number {
    const H = 13
    const dk: [number,number,number] = [Math.max(0,color[0]-30),Math.max(0,color[1]-30),Math.max(0,color[2]-30)]
    doc.setFillColor(...dk);    doc.rect(M,   y, 4,   H, 'F')
    doc.setFillColor(...color); doc.rect(M+4, y, W-4, H, 'F')
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
    doc.text(safeText(title).toUpperCase(), M + 10, y + 9)
    return y + H + 4
  }

  // "LO SAPEVI?" callout: colored bullet + label + italic body, amber background
  function magCuriositaBox(text: string, color: [number,number,number], y: number): number {
    doc.setFontSize(8.5)
    const lines = doc.splitTextToSize(safeText(text), W - 16)
    const H = lines.length * LINE_H + 15
    doc.setFillColor(...AMBER_BG); doc.roundedRect(M, y, W, H, 2.5, 2.5, 'F')
    doc.setFillColor(...color);    doc.roundedRect(M, y, 3.5, H, 1.5, 1.5, 'F')
    doc.setFillColor(...color);    doc.rect(M + 8, y + 4.5, 2.5, 2.5, 'F')  // bullet square
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...color)
    doc.text('LO SAPEVI?', M + 13, y + 7)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...INK)
    doc.text(lines, M + 8, y + 12)
    return y + H + 4
  }

  // In-section POI sub-heading with accent rule
  function magSubsection(title: string, color: [number,number,number], y: number): number {
    doc.setFillColor(...color); doc.rect(M, y, W, 0.4, 'F')
    const lines = doc.splitTextToSize(safeText(title), W)
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...color)
    doc.text(lines, M, y + 3.5)
    return y + 0.4 + 3.5 + lines.length * 4.8 + 4
  }

  // POI card: photo left (optional) + text right; returns new Y after card
  function renderMagPoiCard(entry: { poi: PoiItem; wiki: WikiPage }, thumb: string | null, y: number): number {
    const PHOTO_W = 46, PHOTO_H = 34
    const hasPhoto = !!thumb
    const CARD_H   = hasPhoto ? PHOTO_H + 8 : 28
    const TEXT_X   = M + (hasPhoto ? PHOTO_W + 5 : 5)
    const TEXT_W   = W  - (hasPhoto ? PHOTO_W + 5 : 5)

    doc.setFillColor(252, 252, 252);  doc.roundedRect(M, y, W, CARD_H, 2, 2, 'F')
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.25); doc.roundedRect(M, y, W, CARD_H, 2, 2, 'S')

    if (hasPhoto) {
      doc.addImage(thumb!, 'JPEG', M + 2, y + 2, PHOTO_W - 2, PHOTO_H - 2)
    } else {
      const ac = POI_COLORS[entry.poi.type] ?? AMBER
      doc.setFillColor(...ac); doc.roundedRect(M, y, 3.5, CARD_H, 1.5, 1.5, 'F')
    }

    // Name
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK)
    const nameLines = doc.splitTextToSize(safeText(entry.wiki.title), TEXT_W - 2)
    doc.text(nameLines.slice(0, 2), TEXT_X, y + 4.5)

    // Type badge + distance
    const typeLabel  = POI_LABELS[entry.poi.type] ?? entry.poi.type
    const distStr    = entry.poi.distFromTrack < 1000
      ? `${entry.poi.distFromTrack.toFixed(0)} m`
      : `${(entry.poi.distFromTrack / 1000).toFixed(1)} km`
    const badgeY = y + 4.5 + Math.min(nameLines.length, 2) * 4.3 + 0.5
    const badgeC = POI_COLORS[entry.poi.type] ?? AMBER
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...WHITE)
    const pilW = doc.getTextWidth(typeLabel) + 6
    doc.setFillColor(...badgeC); doc.roundedRect(TEXT_X, badgeY, pilW, 5, 1.5, 1.5, 'F')
    doc.text(typeLabel, TEXT_X + 3, badgeY + 3.5)
    txt(doc, `${distStr} dal percorso`, TEXT_X + pilW + 4, badgeY + 3.5, { size: 6.5, color: STONE })

    // Excerpt (2 lines italic)
    if (entry.wiki.extract) {
      const exY    = badgeY + 7
      const exText = safeText(entry.wiki.extract.slice(0, 180).replace(/\n+/g, ' '))
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...STONE)
      doc.text(doc.splitTextToSize(exText, TEXT_W - 2).slice(0, 2), TEXT_X, exY)
    }

    // Wikipedia link
    if (entry.wiki.url) {
      const lkY = y + CARD_H - 4
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...AMBER)
      doc.text('> Wikipedia', TEXT_X, lkY)
      doc.link(TEXT_X, lkY - 3.5, 22, 4, { url: entry.wiki.url })
    }

    return y + CARD_H + 4
  }

  // ── Two-column state ──────────────────────────────────────────────────────────
  let leftY = CONTENT_TOP, rightY = CONTENT_TOP, inLeft = true
  let sectionColor: [number,number,number] = AMBER

  const syncCols = () => { const mx = Math.max(leftY, rightY); leftY = rightY = mx; inLeft = true }
  const getX = () => inLeft ? LEFT_X : RIGHT_X
  const getY = () => inLeft ? leftY : rightY
  const setY = (v: number) => { if (inLeft) leftY = v; else rightY = v }

  const needSpace = (h: number) => {
    syncCols()
    if (leftY + h > CONTENT_BOTTOM) {
      doc.addPage(); addRunningHeader(hike.title); leftY = rightY = CONTENT_TOP; inLeft = true
    }
  }

  // Lead paragraph: bold-italic full-width for section intro
  const renderLeadPara = (text: string) => {
    const safe = safeText(text); if (!safe) return
    syncCols()
    const lines = doc.splitTextToSize(safe, W)
    const h = lines.length * 5.4 + PARA_GAP
    if (leftY + h > CONTENT_BOTTOM) {
      doc.addPage(); addRunningHeader(hike.title); leftY = rightY = CONTENT_TOP; inLeft = true
    }
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(...INK)
    doc.text(lines, M, leftY)
    leftY = rightY = leftY + h; inLeft = true
  }

  // Body paragraph: 8.5pt normal, flows left→right column, then new page
  const renderPara = (text: string) => {
    const safe = safeText(text); if (!safe) return
    const go = (n: number) => {
      if (n > 2) return
      const x = getX(), y = getY()
      const lines = doc.splitTextToSize(safe, COL_W)
      const h = lines.length * LINE_H + PARA_GAP
      if (y + h > CONTENT_BOTTOM) {
        if (inLeft) { inLeft = false; go(n + 1) }
        else { doc.addPage(); addRunningHeader(hike.title); leftY = rightY = CONTENT_TOP; inLeft = true; go(n + 1) }
        return
      }
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK)
      doc.text(lines, x, y); setY(y + h)
    }
    go(0)
  }

  // ══ COVER PAGE ════════════════════════════════════════════════════════════════
  const pts = (hike.trackPoints ?? []).filter(p => p.lat && p.lon).map(p => [p.lat!, p.lon!] as [number,number])
  const pStep = Math.max(1, Math.ceil(pts.length / 300))
  const sampled = pts.length > 1 ? pts.filter((_, i) => i % pStep === 0) : (hike.routePolyline ?? []) as [number,number][]

  if (sampled.length > 1) {
    const px = 2100
    const mapImg = await fetchSatMap(sampled, px, Math.round(px * COVER_MAP_H / 210), '#f59e0b')
    if (mapImg) doc.addImage(mapImg, 'PNG', 0, 0, 210, COVER_MAP_H)
    else { doc.setFillColor(200, 190, 175); doc.rect(0, 0, 210, COVER_MAP_H, 'F') }
  } else {
    doc.setFillColor(200, 190, 175); doc.rect(0, 0, 210, COVER_MAP_H, 'F')
  }

  const gradImg = createGradientOverlay(840, Math.round(840 * COVER_GRAD_H / 210))
  doc.addImage(gradImg, 'PNG', 0, COVER_MAP_H - COVER_GRAD_H, 210, COVER_GRAD_H)

  // Category badge (from first tag or difficulty)
  const catTag = (hike.tags?.[0] ? safeText(hike.tags[0]) : null)
    ?? (hike.assessment?.difficulty ? safeText(hike.assessment.difficulty) : 'Escursione')
  const TAG_Y = COVER_MAP_H - 60
  doc.setFontSize(7); doc.setFont('helvetica', 'bold')
  const catBadgeW = doc.getTextWidth(catTag.toUpperCase()) + 16
  doc.setFillColor(...AMBER); doc.roundedRect(M, TAG_Y, catBadgeW, 7, 2, 2, 'F')
  doc.setTextColor(...WHITE); doc.text(catTag.toUpperCase(), M + 8, TAG_Y + 5)

  // Title
  const TITLE_Y = TAG_Y + 11
  let ttl = safeText(hike.title).toUpperCase()
  doc.setFont('helvetica', 'bold')
  let tSz = 24; doc.setFontSize(tSz)
  while (doc.getTextWidth(ttl) > W && tSz > 13) { tSz -= 0.5; doc.setFontSize(tSz) }
  const tLines: string[] = doc.splitTextToSize(ttl, W)
  doc.setTextColor(...WHITE)
  tLines.forEach((l: string, i: number) => doc.text(l, M, TITLE_Y + i * Math.round(tSz * 0.42)))

  if (hike.plannedDate) {
    const dl = format(new Date(hike.plannedDate + 'T12:00'), "EEEE d MMMM yyyy", { locale: it })
    txt(doc, safeText(dl), M, TITLE_Y + tLines.length * Math.round(tSz * 0.42) + 5, { size: 9, color: AMBER_SOFT })
  }

  // Stats strip
  const STRIP_H = 19
  doc.setFillColor(...AMBER); doc.rect(0, COVER_MAP_H, 210, STRIP_H, 'F')
  const STATS = [
    { label: 'Distanza',       value: `${(hike.distanceMeters / 1000).toFixed(1)} km` },
    { label: 'Dislivello +',   value: `${Math.round(hike.elevationGain)} m` },
    { label: 'Quota massima',  value: `${Math.round(hike.altitudeMax)} m slm` },
    { label: 'Durata stimata', value: formatDuration(hike.estimatedTimeSeconds) },
  ]
  const slotW = 210 / STATS.length
  STATS.forEach((s, i) => {
    const cx = i * slotW + slotW / 2
    txt(doc, s.value, cx, COVER_MAP_H + 10, { size: 11, bold: true, color: WHITE,      align: 'center' })
    txt(doc, s.label, cx, COVER_MAP_H + 16, { size: 6.5,             color: AMBER_SOFT, align: 'center' })
  })

  // White bottom section — guide intro
  const WHITE_Y = COVER_MAP_H + STRIP_H
  doc.setFillColor(255, 255, 255); doc.rect(0, WHITE_Y, 210, PAGE_H - WHITE_Y, 'F')
  txt(doc, 'Con Giulia', M, WHITE_Y + 14, { size: 12, bold: true, color: AMBER })
  txt(doc, 'Guida escursionistica con storia, natura e curiosita locali', M, WHITE_Y + 21, { size: 8, color: STONE })
  if (hike.assessment?.difficulty)       txt(doc, `Difficolta: ${safeText(hike.assessment.difficulty)}`,          M, WHITE_Y + 31, { size: 8, color: INK })
  if (hike.assessment?.suitabilityScore) txt(doc, `Adatta all\'${hike.assessment.suitabilityScore}% degli escursionisti`, M, WHITE_Y + 39, { size: 8, color: INK })
  doc.setFillColor(...AMBER); doc.rect(M, PAGE_H - 14, W, 0.5, 'F')
  txt(doc, `Generata il ${format(new Date(), 'dd/MM/yyyy')}  ·  dtrek.app`, 105, PAGE_H - 8, { size: 7, color: STONE, align: 'center' })

  // ══ CONTENT PAGES ════════════════════════════════════════════════════════════
  doc.addPage()
  addRunningHeader(hike.title)
  leftY = rightY = CONTENT_TOP; inLeft = true

  for (const el of elements) {
    if (el.type === 'section-header') {
      sectionColor = el.color
      needSpace(22)
      leftY = rightY = magSectionHeader(el.title, el.color, leftY)
      inLeft = true

    } else if (el.type === 'subsection') {
      syncCols()
      needSpace(12)
      leftY = rightY = magSubsection(el.title, sectionColor, leftY)
      inLeft = true

    } else if (el.type === 'curiosita') {
      doc.setFontSize(8.5)
      const ls = doc.splitTextToSize(safeText(el.text), W - 16)
      needSpace(ls.length * LINE_H + 19)
      leftY = rightY = magCuriositaBox(el.text, sectionColor, leftY)
      inLeft = true

    } else {
      if (el.isLead) renderLeadPara(el.text)
      else           renderPara(el.text)
    }
  }

  // ── Magazine POI section ──────────────────────────────────────────────────────
  if (wikiEntries.length > 0 || rawPois.length > 0) {
    const rawOnly = rawPois.filter(p => !wikiEntries.some(e => e.poi.id === p.id) && p.name)
    needSpace(22)
    leftY = rightY = magSectionHeader(
      `${wikiEntries.length + rawOnly.length} Luoghi nel Percorso e Dintorni`,
      AMBER, leftY,
    )
    inLeft = true

    // Wiki entries as magazine cards
    for (const entry of wikiEntries) {
      const thumb   = thumbs.get(entry.wiki.pageid) ?? null
      const cardEst = thumb ? 46 : 32
      needSpace(cardEst)
      syncCols()
      leftY = rightY = renderMagPoiCard(entry, thumb, leftY)
      inLeft = true
    }

    // Raw POIs — compact 3-column pill grid
    if (rawOnly.length > 0) {
      needSpace(10); syncCols()
      txt(doc, 'Altri punti di interesse:', M, leftY + 4, { size: 7.5, bold: true, color: STONE })
      leftY = rightY = leftY + 8; inLeft = true
      const colW3 = (W - 4) / 3
      rawOnly.forEach((p, i) => {
        if (leftY + 8 > CONTENT_BOTTOM) { doc.addPage(); addRunningHeader(hike.title); leftY = rightY = CONTENT_TOP }
        const col = i % 3
        const cx = M + col * (colW3 + 2), cy = leftY
        doc.setFillColor(...STONE50); doc.roundedRect(cx, cy - 2, colW3, 6, 1.5, 1.5, 'F')
        const n2 = safeText(p.name ?? POI_LABELS[p.type] ?? p.type).slice(0, 24)
        txt(doc, n2, cx + 2, cy + 2.5, { size: 7.5 })
        txt(doc, POI_LABELS[p.type] ?? p.type, cx + colW3, cy + 2.5, { size: 6.5, color: STONE, align: 'right' })
        if (col === 2 || i === rawOnly.length - 1) { leftY = rightY = cy + 8; inLeft = true }
      })
    }
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
