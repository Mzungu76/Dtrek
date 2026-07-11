import type { ActivityMeta } from '@/lib/blobStore'
import { mkCanvas, chartRouteFallback } from './canvasCharts'

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
 * Width:height ratio of a route's padded bounding box in Web Mercator pixel
 * space (x and y both scale by 2^z, so the ratio is the same at any zoom).
 * Callers use this to size the output canvas passed to fetchSatMap /
 * fetchAllRoutesSatMap so drawLetterboxed's white bars — needed there to
 * avoid distorting the map — stay minimal instead of assuming every route
 * fits a fixed landscape shape.
 */
export function mapBoxAspect(pts: [number, number][], padFrac: number): number {
  if (pts.length < 2) return 1
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const padLat = (maxLat - minLat) * padFrac || 0.003
  const padLon = (maxLon - minLon) * padFrac || 0.003
  const tl = latLonToXY(maxLat + padLat, minLon - padLon, 0)
  const br = latLonToXY(minLat - padLat, maxLon + padLon, 0)
  const w = br.x - tl.x, h = br.y - tl.y
  return h > 0 ? w / h : 1
}

/**
 * Draw a cropped region of `src` onto a new outW×outH canvas, scaling
 * uniformly (preserving aspect ratio) — never stretching non-uniformly to
 * fill the target box, which is what produced the visibly distorted PDF
 * guide cover (a 794×630 map forced via CSS object-fit into a 794×1123
 * portrait box, an operation html2canvas doesn't render reliably).
 *
 * 'contain' (default) letterboxes with white bars when the crop's aspect
 * doesn't match the output box — used wherever the whole route must stay
 * visible (Diario's report maps). 'cover' instead scales up until the crop
 * fills the box completely, cropping the overflow — used for a full-bleed
 * cover image, where a white bar would look broken but losing a sliver of
 * map at the edges doesn't.
 */
function drawFitted(
  src: HTMLCanvasElement,
  cropX: number, cropY: number, cropW: number, cropH: number,
  outW: number, outH: number,
  fit: 'contain' | 'cover' = 'contain',
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = outW; out.height = outH
  const octx = out.getContext('2d')!
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, outW, outH)
  if (cropW > 0 && cropH > 0) {
    const scale = fit === 'cover'
      ? Math.max(outW / cropW, outH / cropH)
      : Math.min(outW / cropW, outH / cropH)
    const drawW = cropW * scale, drawH = cropH * scale
    const dx = (outW - drawW) / 2, dy = (outH - drawH) / 2
    // For 'cover', dx/dy go negative and part of the image lands outside the
    // canvas — the Canvas API clips that silently, which is exactly the crop
    // we want (no manual bounds math needed).
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
  fit: 'contain' | 'cover' = 'contain',
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

    const out = drawFitted(full, cropX, cropY, cropW, cropH, outW, outH, fit)

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

    const out = drawFitted(full, cropX, cropY, cropW, cropH, outW, outH)

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
