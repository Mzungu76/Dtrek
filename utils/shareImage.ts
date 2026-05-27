// Canvas-based image generation for social sharing (client-side only)

import { ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { computeGlobalStats } from '@/lib/blobStore'
import { getPersonalRecords, computeStreaks, formatPaceMinkm, COMPARISON_COLORS } from '@/lib/stats'

export type ShareFormat = '1:1' | '16:9'

export interface ActivityShareOpts {
  showMap: boolean       // real OSM tiles + route
  showRoute: boolean     // abstract route (ignored when showMap is true)
  showDistance: boolean
  showElevation: boolean
  showDuration: boolean
  showHR: boolean
  showCalories: boolean
  showDate: boolean
}

export interface StatsShareOpts {
  showTotals: boolean
  showStreaks: boolean
  showRecords: boolean
}

export interface ComparisonShareOpts {
  showDistance: boolean
  showElevation: boolean
  showDuration: boolean
  showHR: boolean
  showCalories: boolean
  showPace: boolean
}

export interface MapShareOpts {
  showCount: boolean
}

// ─── Colors & font ────────────────────────────────────────────────────────────

const C = {
  bgTop:      '#1a3c26',
  bgBot:      '#0e2118',
  accent:     '#5bc47a',
  white:      '#ffffff',
  muted:      'rgba(255,255,255,0.5)',
  cardBg:     'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.13)',
}

const FONT = '"SF Pro Display", "Helvetica Neue", Arial, sans-serif'

// ─── Canvas helpers ────────────────────────────────────────────────────────────

function makeCanvas(fmt: ShareFormat): [HTMLCanvasElement, CanvasRenderingContext2D, number, number] {
  const [w, h] = fmt === '1:1' ? [1080, 1080] : [1200, 630]
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  return [canvas, ctx, w, h]
}

function drawBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(w * 0.6, 0, 0, h)
  g.addColorStop(0, C.bgTop)
  g.addColorStop(1, C.bgBot)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 14) {
  rr(ctx, x, y, w, h, r)
  ctx.fillStyle = C.cardBg
  ctx.fill()
  ctx.strokeStyle = C.cardBorder
  ctx.lineWidth = 1
  ctx.stroke()
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save()
  ctx.font = `bold 20px ${FONT}`
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.textAlign = 'right'
  ctx.fillText('DTrek', w - 32, h - 28)
  ctx.restore()
}

function pill(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, pw: number, ph: number,
  label: string, value: string,
) {
  drawCard(ctx, x, y, pw, ph, 12)
  ctx.font = `10px ${FONT}`
  ctx.fillStyle = C.muted
  ctx.textAlign = 'left'
  ctx.fillText(label.toUpperCase(), x + 12, y + 18)
  ctx.font = `bold 20px ${FONT}`
  ctx.fillStyle = C.accent
  ctx.fillText(value, x + 12, y + ph - 12)
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  let t = text
  while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2) + '…'
  return t
}

// ─── Abstract route (dark bg) ──────────────────────────────────────────────────

function drawRouteAbstract(
  ctx: CanvasRenderingContext2D,
  polyline: [number, number][],
  x: number, y: number, w: number, h: number,
  color = C.accent, lw = 3.5,
) {
  if (polyline.length < 2) return
  const lats = polyline.map(p => p[0])
  const lons = polyline.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const latR = maxLat - minLat || 0.0001
  const lonR = maxLon - minLon || 0.0001
  const pad = 0.1
  const scale = Math.min(w * (1 - 2 * pad) / lonR, h * (1 - 2 * pad) / latR)
  const offX = x + (w - lonR * scale) / 2
  const offY = y + (h - latR * scale) / 2
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.beginPath()
  polyline.forEach(([lat, lon], i) => {
    const px = offX + (lon - minLon) * scale
    const py = offY + (maxLat - lat) * scale
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  })
  ctx.stroke()
  // dots
  const [s0, s1] = polyline[0]
  const [e0, e1] = polyline[polyline.length - 1]
  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.arc(offX + (s1 - minLon) * scale, offY + (maxLat - s0) * scale, 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(offX + (e1 - minLon) * scale, offY + (maxLat - e0) * scale, 5, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// ─── OSM tile drawing ──────────────────────────────────────────────────────────

function lonToTileFrac(lon: number, z: number): number {
  return ((lon + 180) / 360) * Math.pow(2, z)
}
function latToTileFrac(lat: number, z: number): number {
  const r = lat * Math.PI / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z)
}

function chooseTileZoom(
  minLat: number, maxLat: number,
  minLon: number, maxLon: number,
  maxTiles = 16,
): number {
  for (let z = 17; z >= 1; z--) {
    const cols = Math.floor(lonToTileFrac(maxLon, z)) - Math.floor(lonToTileFrac(minLon, z)) + 1
    const rows = Math.floor(latToTileFrac(minLat, z)) - Math.floor(latToTileFrac(maxLat, z)) + 1
    if (cols * rows <= maxTiles) return z
  }
  return 1
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload  = () => res(img)
    img.onerror = rej
    img.src = url
  })
}

interface TileCtx {
  pixelOf: (lat: number, lon: number) => [number, number]
}

async function drawTiledMap(
  ctx: CanvasRenderingContext2D,
  polylines: [number, number][][],       // one or more routes
  canvasX: number, canvasY: number,
  canvasW: number, canvasH: number,
  clipRadius = 16,
): Promise<TileCtx> {
  const TILE_PX = 256

  // Global bounding box
  const allPts = polylines.flat()
  const lats = allPts.map(p => p[0])
  const lons = allPts.map(p => p[1])
  const minLat0 = Math.min(...lats), maxLat0 = Math.max(...lats)
  const minLon0 = Math.min(...lons), maxLon0 = Math.max(...lons)

  // Pad 20 %
  const latPad = (maxLat0 - minLat0) * 0.2 || 0.004
  const lonPad = (maxLon0 - minLon0) * 0.2 || 0.004
  const minLat = minLat0 - latPad, maxLat = maxLat0 + latPad
  const minLon = minLon0 - lonPad, maxLon = maxLon0 + lonPad

  const zoom = chooseTileZoom(minLat, maxLat, minLon, maxLon, 25)

  const txMin = Math.floor(lonToTileFrac(minLon, zoom))
  const txMax = Math.floor(lonToTileFrac(maxLon, zoom))
  const tyMin = Math.floor(latToTileFrac(maxLat, zoom)) // north → smaller y
  const tyMax = Math.floor(latToTileFrac(minLat, zoom))

  const gridCols = txMax - txMin + 1
  const gridRows = tyMax - tyMin + 1

  // Scale so the tile grid fills the canvas area
  const scale = Math.min(canvasW / (gridCols * TILE_PX), canvasH / (gridRows * TILE_PX))
  const scaledW = gridCols * TILE_PX * scale
  const scaledH = gridRows * TILE_PX * scale
  const offX = canvasX + (canvasW - scaledW) / 2
  const offY = canvasY + (canvasH - scaledH) / 2

  // Clip to rounded rect
  ctx.save()
  rr(ctx, canvasX, canvasY, canvasW, canvasH, clipRadius)
  ctx.clip()

  // Draw tiles (fetch in parallel)
  const fetches: Promise<void>[] = []
  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      const px = offX + (tx - txMin) * TILE_PX * scale
      const py = offY + (ty - tyMin) * TILE_PX * scale
      const tw = TILE_PX * scale
      const th = TILE_PX * scale
      const p = loadImg(`/api/tile?z=${zoom}&x=${tx}&y=${ty}`)
        .then(img => { ctx.drawImage(img, px, py, tw, th) })
        .catch(() => {
          ctx.fillStyle = '#e8f5e9'
          ctx.fillRect(px, py, tw, th)
        })
      fetches.push(p)
    }
  }
  await Promise.all(fetches)

  ctx.restore()

  // Helper: lat/lon → canvas pixel
  const pixelOf = (lat: number, lon: number): [number, number] => [
    offX + (lonToTileFrac(lon, zoom) - txMin) * TILE_PX * scale,
    offY + (latToTileFrac(lat, zoom) - tyMin) * TILE_PX * scale,
  ]

  return { pixelOf }
}

function drawRouteOnTiles(
  ctx: CanvasRenderingContext2D,
  polyline: [number, number][],
  pixelOf: (lat: number, lon: number) => [number, number],
  color: string, lw = 4,
) {
  if (polyline.length < 2) return
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = color
  ctx.shadowBlur = 6
  ctx.beginPath()
  polyline.forEach(([lat, lon], i) => {
    const [px, py] = pixelOf(lat, lon)
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  })
  ctx.stroke()
  // start (green) / end (red) dots
  const [s0, s1] = polyline[0]
  const [e0, e1] = polyline[polyline.length - 1]
  const [sx, sy] = pixelOf(s0, s1)
  const [ex, ey] = pixelOf(e0, e1)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#16a34a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#dc2626'
  ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  ctx.restore()
}

// ─── Activity image ────────────────────────────────────────────────────────────

export async function generateActivityImage(
  activity: ActivityMeta,
  opts: ActivityShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawBg(ctx, w, h)

  const PAD = fmt === '1:1' ? 56 : 50

  const pillData: { label: string; value: string }[] = []
  if (opts.showDistance)  pillData.push({ label: 'Distanza',   value: `${(activity.distanceMeters / 1000).toFixed(1)} km` })
  if (opts.showElevation) pillData.push({ label: 'Dislivello', value: `${Math.round(activity.elevationGain)} m` })
  if (opts.showDuration)  pillData.push({ label: 'Durata',     value: formatDuration(activity.totalTimeSeconds) })
  if (opts.showHR)        pillData.push({ label: 'FC Media',   value: `${activity.avgHeartRate} bpm` })
  if (opts.showCalories)  pillData.push({ label: 'Calorie',    value: `${activity.calories} kcal` })

  const hasPolyline = activity.routePolyline && activity.routePolyline.length > 1
  const useMap      = opts.showMap && hasPolyline
  const useRoute    = !useMap && opts.showRoute && hasPolyline

  if (fmt === '1:1') {
    let y = PAD + 44

    ctx.font = `bold 50px ${FONT}`
    ctx.fillStyle = C.white
    ctx.textAlign = 'left'
    ctx.fillText(fitText(ctx, activity.title ?? 'Escursione', w - 2 * PAD), PAD, y)
    y += 14

    if (opts.showDate) {
      ctx.font = `22px ${FONT}`
      ctx.fillStyle = C.muted
      ctx.fillText(format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it }), PAD, y + 30)
      y += 60
    } else {
      y += 20
    }

    const pillsH  = pillData.length > 0 ? 78 : 0
    const routeH  = (useMap || useRoute)
      ? Math.min(440, h - y - PAD - pillsH - 48)
      : 0

    if (routeH > 80) {
      const ry = y + 12

      if (useMap) {
        const tileCtx = await drawTiledMap(ctx, [activity.routePolyline!], PAD, ry, w - 2 * PAD, routeH)
        drawRouteOnTiles(ctx, activity.routePolyline!, tileCtx.pixelOf, '#2563eb', 4)
      } else {
        rr(ctx, PAD, ry, w - 2 * PAD, routeH, 20)
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fill()
        drawRouteAbstract(ctx, activity.routePolyline!, PAD + 12, ry + 12, w - 2 * PAD - 24, routeH - 24)
      }
      y = ry + routeH + 24
    } else {
      y += 12
    }

    if (pillData.length > 0) {
      const pillW = Math.floor((w - 2 * PAD - (pillData.length - 1) * 10) / pillData.length)
      const pillH = 68
      pillData.forEach((p, i) => pill(ctx, PAD + i * (pillW + 10), y, pillW, pillH, p.label, p.value))
    }
  } else {
    // 16:9: left = text + stats, right = map/route
    const splitX = Math.floor(w * 0.44)
    let y = PAD + 44

    ctx.font = `bold 46px ${FONT}`
    ctx.fillStyle = C.white
    ctx.textAlign = 'left'
    const words = (activity.title ?? 'Escursione').split(' ')
    const maxLineW = splitX - 2 * PAD
    const lines: string[] = []
    let cur = ''
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word
      if (ctx.measureText(test).width > maxLineW && cur) { lines.push(cur); cur = word }
      else cur = test
    }
    if (cur) lines.push(cur)
    lines.slice(0, 2).forEach((l, i) => ctx.fillText(fitText(ctx, l, maxLineW), PAD, y + i * 56))
    y += lines.length > 1 ? 120 : 64

    if (opts.showDate) {
      ctx.font = `20px ${FONT}`
      ctx.fillStyle = C.muted
      ctx.fillText(format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it }), PAD, y)
      y += 40
    }

    if (pillData.length > 0) {
      const colW = Math.floor((splitX - 2 * PAD - 8) / 2)
      const pillH = 60
      pillData.forEach((p, i) =>
        pill(ctx, PAD + (i % 2) * (colW + 8), y + Math.floor(i / 2) * (pillH + 8), colW, pillH, p.label, p.value))
    }

    // Right panel: map or route
    const rx = splitX + 16, ry = PAD
    const rw = w - splitX - PAD - 16, rh = h - 2 * PAD
    if (useMap) {
      const tileCtx = await drawTiledMap(ctx, [activity.routePolyline!], rx, ry, rw, rh)
      drawRouteOnTiles(ctx, activity.routePolyline!, tileCtx.pixelOf, '#2563eb', 4)
    } else if (useRoute) {
      rr(ctx, rx, ry, rw, rh, 20)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      ctx.fill()
      drawRouteAbstract(ctx, activity.routePolyline!, rx + 12, ry + 12, rw - 24, rh - 24)
    }
  }

  drawWatermark(ctx, w, h)
  return canvas.toDataURL('image/png')
}

// ─── Stats image ───────────────────────────────────────────────────────────────

export async function generateStatsImage(
  activities: ActivityMeta[],
  opts: StatsShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawBg(ctx, w, h)

  const PAD = 56
  let y = PAD + 16

  const stats   = computeGlobalStats(activities)
  const records = getPersonalRecords(activities)
  const streaks = computeStreaks(activities)

  ctx.font = `bold 38px ${FONT}`
  ctx.fillStyle = C.accent
  ctx.textAlign = 'left'
  ctx.fillText('DTrek', PAD, y + 32)
  ctx.font = `22px ${FONT}`
  ctx.fillStyle = C.muted
  ctx.fillText('Le mie statistiche di trekking', PAD, y + 64)
  y += 96

  if (opts.showTotals) {
    const totals = [
      { label: 'Escursioni',       value: String(stats.totalActivities) },
      { label: 'Distanza totale',  value: `${stats.totalDistanceKm.toFixed(0)} km` },
      { label: 'Dislivello D+',    value: `${Math.round(stats.totalElevationGain).toLocaleString('it')} m` },
      { label: 'Calorie totali',   value: `${stats.totalCalories.toLocaleString('it')} kcal` },
    ]
    const cols = fmt === '1:1' ? 2 : 4
    const pillW = Math.floor((w - 2 * PAD - (cols - 1) * 14) / cols)
    const pillH = 80
    totals.forEach((t, i) => {
      const px = PAD + (i % cols) * (pillW + 14)
      const py = y + Math.floor(i / cols) * (pillH + 10)
      drawCard(ctx, px, py, pillW, pillH, 14)
      ctx.font = `11px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'left'
      ctx.fillText(t.label.toUpperCase(), px + 14, py + 22)
      ctx.font = `bold 32px ${FONT}`; ctx.fillStyle = C.white
      ctx.fillText(t.value, px + 14, py + 64)
    })
    y += Math.ceil(totals.length / (fmt === '1:1' ? 2 : 4)) * (pillH + 10) + 20
  }

  if (opts.showStreaks) {
    const sh = 90
    drawCard(ctx, PAD, y, w - 2 * PAD, sh, 14)
    ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'left'
    ctx.fillText('STREAK', PAD + 16, y + 22)
    const items = [
      { label: 'Streak attuale', value: `${streaks.currentDays} gg` },
      { label: 'Record',         value: `${streaks.longestDays} gg` },
      { label: 'Sett. attive',   value: String(streaks.totalActiveWeeks) },
    ]
    const sw = Math.floor((w - 2 * PAD - 32) / items.length)
    items.forEach((s, i) => {
      const sx = PAD + 16 + i * sw
      ctx.font = `bold 30px ${FONT}`; ctx.fillStyle = C.accent; ctx.textAlign = 'left'
      ctx.fillText(s.value, sx, y + 64)
      ctx.font = `11px ${FONT}`; ctx.fillStyle = C.muted
      ctx.fillText(s.label, sx, y + 82)
    })
    y += sh + 18
  }

  if (opts.showRecords && fmt === '1:1') {
    const recItems: { label: string; value: string }[] = []
    if (records.longestKm)   recItems.push({ label: 'Più lunga',      value: `${(records.longestKm.distanceMeters / 1000).toFixed(1)} km` })
    if (records.highestGain) recItems.push({ label: 'Più dislivello', value: `${Math.round(records.highestGain.elevationGain)} m D+` })
    if (records.fastestPace) recItems.push({ label: 'Passo record',   value: formatPaceMinkm(records.fastestPace.distanceMeters, records.fastestPace.totalTimeSeconds) + ' /km' })
    if (records.highestAlt)  recItems.push({ label: 'Quota massima',  value: `${Math.round(records.highestAlt.altitudeMax)} m` })

    if (recItems.length > 0) {
      ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'left'
      ctx.fillText('RECORD PERSONALI', PAD, y + 14)
      y += 24
      const rW = Math.floor((w - 2 * PAD - 12) / 2)
      const rH = 70
      recItems.slice(0, 4).forEach((r, i) => {
        const px = PAD + (i % 2) * (rW + 12)
        const py = y + Math.floor(i / 2) * (rH + 8)
        drawCard(ctx, px, py, rW, rH, 12)
        ctx.font = `10px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'left'
        ctx.fillText(r.label.toUpperCase(), px + 12, py + 18)
        ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = C.accent
        ctx.fillText(r.value, px + 12, py + 54)
      })
    }
  }

  drawWatermark(ctx, w, h)
  return canvas.toDataURL('image/png')
}

// ─── Comparison image ──────────────────────────────────────────────────────────

export async function generateComparisonImage(
  activities: ActivityMeta[],
  opts: ComparisonShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawBg(ctx, w, h)

  const PAD = 48
  let y = PAD + 16

  ctx.font = `bold 34px ${FONT}`; ctx.fillStyle = C.white; ctx.textAlign = 'left'
  ctx.fillText('Confronto escursioni', PAD, y + 32)
  y += 60

  const metrics: { label: string; fmt: (a: ActivityMeta) => string; get: (a: ActivityMeta) => number; higher: boolean }[] = []
  if (opts.showDistance)  metrics.push({ label: 'Distanza',   fmt: a => `${(a.distanceMeters/1000).toFixed(1)} km`,  get: a => a.distanceMeters,   higher: true  })
  if (opts.showElevation) metrics.push({ label: 'Dislivello', fmt: a => `${Math.round(a.elevationGain)} m`,           get: a => a.elevationGain,    higher: true  })
  if (opts.showDuration)  metrics.push({ label: 'Durata',     fmt: a => formatDuration(a.totalTimeSeconds),           get: a => a.totalTimeSeconds, higher: true  })
  if (opts.showHR)        metrics.push({ label: 'FC Media',   fmt: a => `${a.avgHeartRate} bpm`,                      get: a => a.avgHeartRate,     higher: false })
  if (opts.showCalories)  metrics.push({ label: 'Calorie',    fmt: a => `${a.calories} kcal`,                         get: a => a.calories,         higher: true  })
  if (opts.showPace)      metrics.push({ label: 'Passo',      fmt: a => formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds) + '/km', get: a => a.distanceMeters/(a.totalTimeSeconds||1), higher: true })

  const n = activities.length
  const colW = Math.floor((w - 2 * PAD) / (n + 1))

  activities.forEach((a, i) => {
    const x = PAD + (i + 1) * colW
    drawCard(ctx, x + 2, y, colW - 4, 44, 8)
    ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = COMPARISON_COLORS[i] ?? C.accent; ctx.textAlign = 'center'
    ctx.fillText(fitText(ctx, a.title ?? 'Escursione', colW - 16), x + colW / 2, y + 28)
  })
  y += 56

  const rowH = Math.floor(Math.min(52, (h - y - PAD - 10) / (metrics.length || 1)))
  metrics.forEach((m, ri) => {
    const ry = y + ri * (rowH + 4)
    if (ri % 2 === 0) {
      rr(ctx, PAD, ry, w - 2 * PAD, rowH, 8)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill()
    }
    ctx.font = `13px ${FONT}`; ctx.fillStyle = C.muted; ctx.textAlign = 'left'
    ctx.fillText(m.label, PAD + 10, ry + rowH / 2 + 5)
    const vals = activities.map(a => m.get(a))
    const bestVal = m.higher ? Math.max(...vals) : Math.min(...vals)
    activities.forEach((a, i) => {
      const x = PAD + (i + 1) * colW
      const isBest = m.get(a) === bestVal
      ctx.font = `${isBest ? 'bold ' : ''}17px ${FONT}`
      ctx.fillStyle = isBest ? (COMPARISON_COLORS[i] ?? C.accent) : C.white
      ctx.textAlign = 'center'
      ctx.fillText(m.fmt(a), x + colW / 2, ry + rowH / 2 + 6)
    })
  })

  drawWatermark(ctx, w, h)
  return canvas.toDataURL('image/png')
}

// ─── Map image (all routes on OSM tiles) ──────────────────────────────────────

export async function generateMapImage(
  activities: ActivityMeta[],
  opts: MapShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawBg(ctx, w, h)

  const PAD = 56
  const headerH = opts.showCount ? 90 : 60

  ctx.font = `bold 38px ${FONT}`; ctx.fillStyle = C.white; ctx.textAlign = 'left'
  ctx.fillText('Le mie escursioni', PAD, PAD + 38)
  if (opts.showCount) {
    ctx.font = `20px ${FONT}`; ctx.fillStyle = C.muted
    ctx.fillText(
      `${activities.length} percors${activities.length === 1 ? 'o' : 'i'} registrat${activities.length === 1 ? 'o' : 'i'}`,
      PAD, PAD + 70,
    )
  }

  const polylines = activities
    .filter(a => a.routePolyline && a.routePolyline.length > 1)
    .map(a => a.routePolyline as [number, number][])

  if (polylines.length > 0) {
    const mapY = PAD + headerH
    const mapH = h - mapY - PAD
    const mapW = w - 2 * PAD

    const ROUTE_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#be185d']

    const tileCtx = await drawTiledMap(ctx, polylines, PAD, mapY, mapW, mapH)
    polylines.forEach((poly, i) => {
      const color = ROUTE_COLORS[i % ROUTE_COLORS.length]
      drawRouteOnTiles(ctx, poly, tileCtx.pixelOf, color, 3)
    })
  }

  drawWatermark(ctx, w, h)
  return canvas.toDataURL('image/png')
}
