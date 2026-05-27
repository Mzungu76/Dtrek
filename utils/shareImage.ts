// Canvas-based image generation for social sharing (client-side only)

import { ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { computeGlobalStats } from '@/lib/blobStore'
import { getPersonalRecords, computeStreaks, formatPaceMinkm, COMPARISON_COLORS } from '@/lib/stats'

export type ShareFormat = '1:1' | '16:9'

export interface ActivityShareOpts {
  showMap:       boolean   // real OSM/CartoDB tiles
  showRoute:     boolean   // abstract route (when showMap=false)
  showDistance:  boolean
  showElevation: boolean
  showDuration:  boolean
  showHR:        boolean
  showCalories:  boolean
  showDate:      boolean
}

export interface StatsShareOpts {
  showTotals:  boolean
  showStreaks: boolean
  showRecords: boolean
}

export interface ComparisonShareOpts {
  showDistance:  boolean
  showElevation: boolean
  showDuration:  boolean
  showHR:        boolean
  showCalories:  boolean
  showPace:      boolean
}

export interface MapShareOpts {
  showCount: boolean
}

// ─── Canvas utils ─────────────────────────────────────────────────────────────

const FONT = '"SF Pro Display", "Helvetica Neue", Arial, sans-serif'

// Dark palette (used for stats/comparison cards which don't use a map background)
const DARK = {
  bgTop:      '#1a3c26',
  bgBot:      '#0e2118',
  accent:     '#5bc47a',
  white:      '#ffffff',
  muted:      'rgba(255,255,255,0.5)',
  cardBg:     'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.13)',
}

function makeCanvas(fmt: ShareFormat): [HTMLCanvasElement, CanvasRenderingContext2D, number, number] {
  const [w, h] = fmt === '1:1' ? [1080, 1080] : [1200, 630]
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  return [canvas, canvas.getContext('2d')!, w, h]
}

function drawDarkBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(w * 0.6, 0, 0, h)
  g.addColorStop(0, DARK.bgTop)
  g.addColorStop(1, DARK.bgBot)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
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
  ctx.fillStyle = DARK.cardBg; ctx.fill()
  ctx.strokeStyle = DARK.cardBorder; ctx.lineWidth = 1; ctx.stroke()
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, light = true) {
  ctx.save()
  ctx.font = `bold 20px ${FONT}`
  ctx.fillStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.25)'
  ctx.textAlign = 'right'
  ctx.fillText('DTrek', w - 32, h - 28)
  ctx.restore()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  let t = text
  while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2) + '…'
  return t
}

// ─── Dark-bg abstract route (for stats/comparison pages) ──────────────────────

function drawRouteAbstract(
  ctx: CanvasRenderingContext2D,
  polyline: [number, number][],
  x: number, y: number, w: number, h: number,
) {
  if (polyline.length < 2) return
  const lats = polyline.map(p => p[0]), lons = polyline.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const latR = maxLat - minLat || 0.0001, lonR = maxLon - minLon || 0.0001
  const pad = 0.1
  const scale = Math.min(w * (1 - 2 * pad) / lonR, h * (1 - 2 * pad) / latR)
  const offX = x + (w - lonR * scale) / 2
  const offY = y + (h - latR * scale) / 2
  ctx.save()
  ctx.strokeStyle = DARK.accent; ctx.lineWidth = 3.5
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.shadowColor = DARK.accent; ctx.shadowBlur = 8
  ctx.beginPath()
  polyline.forEach(([lat, lon], i) => {
    const px = offX + (lon - minLon) * scale
    const py = offY + (maxLat - lat) * scale
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  })
  ctx.stroke()
  ctx.restore()
}

// ─── OSM/CartoDB tile drawing ──────────────────────────────────────────────────

function lonToTileFrac(lon: number, z: number) { return ((lon + 180) / 360) * 2 ** z }
function latToTileFrac(lat: number, z: number) {
  const r = lat * Math.PI / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

function chooseTileZoom(
  minLat: number, maxLat: number, minLon: number, maxLon: number,
  maxTiles = 20,
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
    img.onload = () => res(img); img.onerror = rej; img.src = url
  })
}

interface TileCtx { pixelOf: (lat: number, lon: number) => [number, number] }

async function drawTiledMap(
  ctx: CanvasRenderingContext2D,
  polylines: [number, number][][],
  canvasX: number, canvasY: number,
  canvasW: number, canvasH: number,
  opts: { radius?: number; style?: string; fillCanvas?: boolean } = {},
): Promise<TileCtx> {
  const TILE_PX  = 256
  const { radius = 0, style = 'dark', fillCanvas = false } = opts

  const allPts  = polylines.flat()
  const lats    = allPts.map(p => p[0]), lons = allPts.map(p => p[1])
  const minLat0 = Math.min(...lats), maxLat0 = Math.max(...lats)
  const minLon0 = Math.min(...lons), maxLon0 = Math.max(...lons)

  // Pad bounds 20 % so the route doesn't touch the edge
  const latPad = (maxLat0 - minLat0) * 0.2 || 0.004
  const lonPad = (maxLon0 - minLon0) * 0.2 || 0.004
  const minLat = minLat0 - latPad, maxLat = maxLat0 + latPad
  const minLon = minLon0 - lonPad, maxLon = maxLon0 + lonPad

  const zoom  = chooseTileZoom(minLat, maxLat, minLon, maxLon, 25)
  const txMin = Math.floor(lonToTileFrac(minLon, zoom))
  const txMax = Math.floor(lonToTileFrac(maxLon, zoom))
  const tyMin = Math.floor(latToTileFrac(maxLat, zoom))
  const tyMax = Math.floor(latToTileFrac(minLat, zoom))

  const cols = txMax - txMin + 1, rows = tyMax - tyMin + 1

  // Scale so tile grid fills canvas area (cover, not contain, when fillCanvas=true)
  const scaleX = canvasW / (cols * TILE_PX)
  const scaleY = canvasH / (rows * TILE_PX)
  const scale  = fillCanvas ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)

  const scaledW = cols * TILE_PX * scale
  const scaledH = rows * TILE_PX * scale
  const offX    = canvasX + (canvasW - scaledW) / 2
  const offY    = canvasY + (canvasH - scaledH) / 2

  // Clip so tiles don't bleed outside the designated area
  ctx.save()
  if (radius > 0) { rr(ctx, canvasX, canvasY, canvasW, canvasH, radius); ctx.clip() }
  else { ctx.beginPath(); ctx.rect(canvasX, canvasY, canvasW, canvasH); ctx.clip() }

  // Fetch + draw tiles in parallel
  // Pixel positions are derived from the next-tile boundary to avoid gaps
  const fetches: Promise<void>[] = []
  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      // Round to int using next tile's position → eliminates sub-pixel gaps
      const px0 = Math.round(offX + (tx - txMin)     * TILE_PX * scale)
      const py0 = Math.round(offY + (ty - tyMin)     * TILE_PX * scale)
      const px1 = Math.round(offX + (tx - txMin + 1) * TILE_PX * scale)
      const py1 = Math.round(offY + (ty - tyMin + 1) * TILE_PX * scale)
      const p = loadImg(`/api/tile?z=${zoom}&x=${tx}&y=${ty}&style=${style}`)
        .then(img => { ctx.drawImage(img, px0, py0, px1 - px0, py1 - py0) })
        .catch(() => { ctx.fillStyle = style === 'dark' ? '#1a1a2e' : '#e8f5e9'; ctx.fillRect(px0, py0, px1 - px0, py1 - py0) })
      fetches.push(p)
    }
  }
  await Promise.all(fetches)
  ctx.restore()

  const pixelOf = (lat: number, lon: number): [number, number] => [
    offX + (lonToTileFrac(lon, zoom) - txMin) * TILE_PX * scale,
    offY + (latToTileFrac(lat, zoom) - tyMin) * TILE_PX * scale,
  ]
  return { pixelOf }
}

// Strava-style route: white thick outline + colored line on top
function drawRouteOnTiles(
  ctx: CanvasRenderingContext2D,
  polyline: [number, number][],
  pixelOf: (lat: number, lon: number) => [number, number],
  color: string,
  lw = 5,
) {
  if (polyline.length < 2) return

  const path = () => {
    ctx.beginPath()
    polyline.forEach(([lat, lon], i) => {
      const [px, py] = pixelOf(lat, lon)
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    })
  }

  // White halo
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = lw + 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  path(); ctx.stroke()

  // Colored route
  ctx.strokeStyle = color
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.shadowColor = color; ctx.shadowBlur = 8
  path(); ctx.stroke()
  ctx.restore()

  // Start (green) / end (red) dots with white border
  const [s0, s1] = polyline[0]
  const [e0, e1] = polyline[polyline.length - 1]
  const [sx, sy] = pixelOf(s0, s1)
  const [ex, ey] = pixelOf(e0, e1)
  for (const [cx, cy, fill] of [[sx, sy, '#16a34a'], [ex, ey, '#dc2626']] as [number, number, string][]) {
    ctx.save()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.fillStyle = fill
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.fill(); ctx.stroke()
    ctx.restore()
  }
}

// ─── ACTIVITY IMAGE — full-bleed map layout ────────────────────────────────────
//
//  ┌──────────────────────────────────┐
//  │  [gradient top]                  │ ← title + date on dark gradient
//  │  Titolo escursione               │
//  │  23 maggio 2026                  │
//  │                                  │
//  │   ██ route on map tiles ██       │  ← tiles fill entire canvas
//  │                                  │
//  │  [gradient bottom]               │ ← stats on dark gradient
//  │  8.7 km   343 m   2h34m   117bpm │
//  └──────────────────────────────────┘

export async function generateActivityImage(
  activity: ActivityMeta,
  opts: ActivityShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)

  const hasPolyline = !!(activity.routePolyline && activity.routePolyline.length > 1)
  const useMap      = opts.showMap && hasPolyline
  const useAbstract = !useMap && opts.showRoute && hasPolyline

  // ── Full-bleed map ────────────────────────────────────────────────────────
  if (useMap) {
    const topH = fmt === '1:1' ? 200 : 170    // gradient header height
    const botH = fmt === '1:1' ? 190 : 160    // gradient footer height

    // 1. Map tiles fill the whole canvas
    const tileCtx = await drawTiledMap(
      ctx, [activity.routePolyline!],
      0, 0, w, h,
      { radius: 0, style: 'dark', fillCanvas: true },
    )

    // 2. Route
    drawRouteOnTiles(ctx, activity.routePolyline!, tileCtx.pixelOf, '#3b82f6', 5)

    // 3. Top gradient
    const topGrad = ctx.createLinearGradient(0, 0, 0, topH)
    topGrad.addColorStop(0,   'rgba(0,0,0,0.82)')
    topGrad.addColorStop(0.7, 'rgba(0,0,0,0.35)')
    topGrad.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = topGrad; ctx.fillRect(0, 0, w, topH)

    // 4. Bottom gradient
    const botGrad = ctx.createLinearGradient(0, h - botH, 0, h)
    botGrad.addColorStop(0,   'rgba(0,0,0,0)')
    botGrad.addColorStop(0.4, 'rgba(0,0,0,0.55)')
    botGrad.addColorStop(1,   'rgba(0,0,0,0.88)')
    ctx.fillStyle = botGrad; ctx.fillRect(0, h - botH, w, botH)

    // 5. Title
    const PAD  = fmt === '1:1' ? 52 : 44
    const titleSz = fmt === '1:1' ? 62 : 48
    ctx.font = `bold ${titleSz}px ${FONT}`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8
    ctx.fillText(fitText(ctx, activity.title ?? 'Escursione', w - 2 * PAD), PAD, PAD + titleSz * 0.82)
    ctx.shadowBlur = 0

    if (opts.showDate) {
      const dateSz = fmt === '1:1' ? 26 : 22
      ctx.font = `${dateSz}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.fillText(
        format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it }),
        PAD, PAD + titleSz * 0.82 + dateSz + 10,
      )
    }

    // 6. Stats row at bottom
    const pillData: { label: string; value: string }[] = []
    if (opts.showDistance)  pillData.push({ label: 'Distanza',   value: `${(activity.distanceMeters / 1000).toFixed(1)} km` })
    if (opts.showElevation) pillData.push({ label: 'Dislivello', value: `${Math.round(activity.elevationGain)} m` })
    if (opts.showDuration)  pillData.push({ label: 'Durata',     value: formatDuration(activity.totalTimeSeconds) })
    if (opts.showHR)        pillData.push({ label: 'FC Media',   value: `${activity.avgHeartRate} bpm` })
    if (opts.showCalories)  pillData.push({ label: 'Calorie',    value: `${activity.calories} kcal` })

    if (pillData.length > 0) {
      const colW    = Math.floor((w - 2 * PAD) / pillData.length)
      const valY    = h - (fmt === '1:1' ? 52 : 44)
      const lblY    = valY + (fmt === '1:1' ? 28 : 24)
      const valSz   = fmt === '1:1' ? 34 : 28
      const lblSz   = fmt === '1:1' ? 13 : 11

      pillData.forEach((p, i) => {
        const cx = PAD + i * colW + colW / 2
        ctx.textAlign = 'center'
        ctx.font = `bold ${valSz}px ${FONT}`
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4
        ctx.fillText(p.value, cx, valY)
        ctx.shadowBlur = 0
        ctx.font = `${lblSz}px ${FONT}`
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fillText(p.label.toUpperCase(), cx, lblY)
      })
    }

    drawWatermark(ctx, w, h, true)
    return canvas.toDataURL('image/png')
  }

  // ── Dark background (abstract route or no route) ─────────────────────────
  drawDarkBg(ctx, w, h)

  const PAD = fmt === '1:1' ? 56 : 50
  const pillData: { label: string; value: string }[] = []
  if (opts.showDistance)  pillData.push({ label: 'Distanza',   value: `${(activity.distanceMeters / 1000).toFixed(1)} km` })
  if (opts.showElevation) pillData.push({ label: 'Dislivello', value: `${Math.round(activity.elevationGain)} m` })
  if (opts.showDuration)  pillData.push({ label: 'Durata',     value: formatDuration(activity.totalTimeSeconds) })
  if (opts.showHR)        pillData.push({ label: 'FC Media',   value: `${activity.avgHeartRate} bpm` })
  if (opts.showCalories)  pillData.push({ label: 'Calorie',    value: `${activity.calories} kcal` })

  let y = PAD + 44
  ctx.font = `bold 50px ${FONT}`; ctx.fillStyle = DARK.white; ctx.textAlign = 'left'
  ctx.fillText(fitText(ctx, activity.title ?? 'Escursione', w - 2 * PAD), PAD, y)
  y += 14
  if (opts.showDate) {
    ctx.font = `22px ${FONT}`; ctx.fillStyle = DARK.muted
    ctx.fillText(format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it }), PAD, y + 30)
    y += 60
  } else { y += 20 }

  if (useAbstract) {
    const pillsH = pillData.length > 0 ? 78 : 0
    const routeH = Math.min(440, h - y - PAD - pillsH - 48)
    if (routeH > 80) {
      const ry = y + 12
      rr(ctx, PAD, ry, w - 2 * PAD, routeH, 20)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill()
      drawRouteAbstract(ctx, activity.routePolyline!, PAD + 12, ry + 12, w - 2 * PAD - 24, routeH - 24)
      y = ry + routeH + 24
    }
  }

  if (pillData.length > 0) {
    const pillW = Math.floor((w - 2 * PAD - (pillData.length - 1) * 10) / pillData.length)
    const pillH = 68
    pillData.forEach((p, i) => {
      const px = PAD + i * (pillW + 10)
      drawCard(ctx, px, y, pillW, pillH, 12)
      ctx.font = `10px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
      ctx.fillText(p.label.toUpperCase(), px + 12, y + 18)
      ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = DARK.accent
      ctx.fillText(p.value, px + 12, y + pillH - 12)
    })
  }

  drawWatermark(ctx, w, h)
  return canvas.toDataURL('image/png')
}

// ─── STATS IMAGE ──────────────────────────────────────────────────────────────

export async function generateStatsImage(
  activities: ActivityMeta[],
  opts: StatsShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawDarkBg(ctx, w, h)

  const PAD = 56
  let y = PAD + 16
  const stats   = computeGlobalStats(activities)
  const records = getPersonalRecords(activities)
  const streaks = computeStreaks(activities)

  ctx.font = `bold 38px ${FONT}`; ctx.fillStyle = DARK.accent; ctx.textAlign = 'left'
  ctx.fillText('DTrek', PAD, y + 32)
  ctx.font = `22px ${FONT}`; ctx.fillStyle = DARK.muted
  ctx.fillText('Le mie statistiche di trekking', PAD, y + 64)
  y += 96

  if (opts.showTotals) {
    const totals = [
      { label: 'Escursioni',      value: String(stats.totalActivities) },
      { label: 'Distanza totale', value: `${stats.totalDistanceKm.toFixed(0)} km` },
      { label: 'Dislivello D+',   value: `${Math.round(stats.totalElevationGain).toLocaleString('it')} m` },
      { label: 'Calorie totali',  value: `${stats.totalCalories.toLocaleString('it')} kcal` },
    ]
    const cols  = fmt === '1:1' ? 2 : 4
    const pillW = Math.floor((w - 2 * PAD - (cols - 1) * 14) / cols)
    const pillH = 80
    totals.forEach((t, i) => {
      const px = PAD + (i % cols) * (pillW + 14)
      const py = y + Math.floor(i / cols) * (pillH + 10)
      drawCard(ctx, px, py, pillW, pillH, 14)
      ctx.font = `11px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
      ctx.fillText(t.label.toUpperCase(), px + 14, py + 22)
      ctx.font = `bold 32px ${FONT}`; ctx.fillStyle = DARK.white
      ctx.fillText(t.value, px + 14, py + 64)
    })
    y += Math.ceil(totals.length / cols) * (pillH + 10) + 20
  }

  if (opts.showStreaks) {
    const sh = 90
    drawCard(ctx, PAD, y, w - 2 * PAD, sh, 14)
    ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
    ctx.fillText('STREAK', PAD + 16, y + 22)
    const items = [
      { label: 'Streak attuale', value: `${streaks.currentDays} gg` },
      { label: 'Record',         value: `${streaks.longestDays} gg` },
      { label: 'Sett. attive',   value: String(streaks.totalActiveWeeks) },
    ]
    const sw = Math.floor((w - 2 * PAD - 32) / items.length)
    items.forEach((s, i) => {
      const sx = PAD + 16 + i * sw
      ctx.font = `bold 30px ${FONT}`; ctx.fillStyle = DARK.accent; ctx.textAlign = 'left'
      ctx.fillText(s.value, sx, y + 64)
      ctx.font = `11px ${FONT}`; ctx.fillStyle = DARK.muted
      ctx.fillText(s.label, sx, y + 82)
    })
    y += sh + 18
  }

  if (opts.showRecords && fmt === '1:1') {
    const items: { label: string; value: string }[] = []
    if (records.longestKm)   items.push({ label: 'Più lunga',      value: `${(records.longestKm.distanceMeters / 1000).toFixed(1)} km` })
    if (records.highestGain) items.push({ label: 'Più dislivello', value: `${Math.round(records.highestGain.elevationGain)} m D+` })
    if (records.fastestPace) items.push({ label: 'Passo record',   value: formatPaceMinkm(records.fastestPace.distanceMeters, records.fastestPace.totalTimeSeconds) + ' /km' })
    if (records.highestAlt)  items.push({ label: 'Quota massima',  value: `${Math.round(records.highestAlt.altitudeMax)} m` })
    if (items.length > 0) {
      ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
      ctx.fillText('RECORD PERSONALI', PAD, y + 14)
      y += 24
      const rW = Math.floor((w - 2 * PAD - 12) / 2), rH = 70
      items.slice(0, 4).forEach((r, i) => {
        const px = PAD + (i % 2) * (rW + 12), py = y + Math.floor(i / 2) * (rH + 8)
        drawCard(ctx, px, py, rW, rH, 12)
        ctx.font = `10px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
        ctx.fillText(r.label.toUpperCase(), px + 12, py + 18)
        ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = DARK.accent
        ctx.fillText(r.value, px + 12, py + 54)
      })
    }
  }

  drawWatermark(ctx, w, h)
  return canvas.toDataURL('image/png')
}

// ─── COMPARISON IMAGE ─────────────────────────────────────────────────────────

export async function generateComparisonImage(
  activities: ActivityMeta[],
  opts: ComparisonShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)
  drawDarkBg(ctx, w, h)

  const PAD = 48
  let y = PAD + 16
  ctx.font = `bold 34px ${FONT}`; ctx.fillStyle = DARK.white; ctx.textAlign = 'left'
  ctx.fillText('Confronto escursioni', PAD, y + 32)
  y += 60

  const metrics: { label: string; fmt: (a: ActivityMeta) => string; get: (a: ActivityMeta) => number; higher: boolean }[] = []
  if (opts.showDistance)  metrics.push({ label: 'Distanza',   fmt: a => `${(a.distanceMeters/1000).toFixed(1)} km`,  get: a => a.distanceMeters,   higher: true  })
  if (opts.showElevation) metrics.push({ label: 'Dislivello', fmt: a => `${Math.round(a.elevationGain)} m`,           get: a => a.elevationGain,    higher: true  })
  if (opts.showDuration)  metrics.push({ label: 'Durata',     fmt: a => formatDuration(a.totalTimeSeconds),           get: a => a.totalTimeSeconds, higher: true  })
  if (opts.showHR)        metrics.push({ label: 'FC Media',   fmt: a => `${a.avgHeartRate} bpm`,                      get: a => a.avgHeartRate,     higher: false })
  if (opts.showCalories)  metrics.push({ label: 'Calorie',    fmt: a => `${a.calories} kcal`,                         get: a => a.calories,         higher: true  })
  if (opts.showPace)      metrics.push({ label: 'Passo',      fmt: a => formatPaceMinkm(a.distanceMeters, a.totalTimeSeconds) + '/km', get: a => a.distanceMeters / (a.totalTimeSeconds || 1), higher: true })

  const n    = activities.length
  const colW = Math.floor((w - 2 * PAD) / (n + 1))

  activities.forEach((a, i) => {
    const x = PAD + (i + 1) * colW
    drawCard(ctx, x + 2, y, colW - 4, 44, 8)
    ctx.font = `bold 12px ${FONT}`; ctx.fillStyle = COMPARISON_COLORS[i] ?? DARK.accent; ctx.textAlign = 'center'
    ctx.fillText(fitText(ctx, a.title ?? 'Escursione', colW - 16), x + colW / 2, y + 28)
  })
  y += 56

  const rowH = Math.floor(Math.min(52, (h - y - PAD - 10) / (metrics.length || 1)))
  metrics.forEach((m, ri) => {
    const ry = y + ri * (rowH + 4)
    if (ri % 2 === 0) { rr(ctx, PAD, ry, w - 2 * PAD, rowH, 8); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill() }
    ctx.font = `13px ${FONT}`; ctx.fillStyle = DARK.muted; ctx.textAlign = 'left'
    ctx.fillText(m.label, PAD + 10, ry + rowH / 2 + 5)
    const vals    = activities.map(a => m.get(a))
    const bestVal = m.higher ? Math.max(...vals) : Math.min(...vals)
    activities.forEach((a, i) => {
      const x     = PAD + (i + 1) * colW
      const isBest = m.get(a) === bestVal
      ctx.font      = `${isBest ? 'bold ' : ''}17px ${FONT}`
      ctx.fillStyle = isBest ? (COMPARISON_COLORS[i] ?? DARK.accent) : DARK.white
      ctx.textAlign = 'center'
      ctx.fillText(m.fmt(a), x + colW / 2, ry + rowH / 2 + 6)
    })
  })

  drawWatermark(ctx, w, h)
  return canvas.toDataURL('image/png')
}

// ─── MAP IMAGE — all routes on full-bleed dark tiles ──────────────────────────

const ROUTE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f97316', '#06b6d4', '#eab308', '#ec4899']

export async function generateMapImage(
  activities: ActivityMeta[],
  opts: MapShareOpts,
  fmt: ShareFormat,
): Promise<string> {
  const [canvas, ctx, w, h] = makeCanvas(fmt)

  const polylines = activities
    .filter(a => a.routePolyline && a.routePolyline.length > 1)
    .map(a => a.routePolyline as [number, number][])

  if (polylines.length === 0) {
    drawDarkBg(ctx, w, h)
    ctx.font = `bold 38px ${FONT}`; ctx.fillStyle = DARK.white; ctx.textAlign = 'left'
    ctx.fillText('Le mie escursioni', 56, 56 + 38)
    drawWatermark(ctx, w, h)
    return canvas.toDataURL('image/png')
  }

  // Full-bleed map
  const tileCtx = await drawTiledMap(ctx, polylines, 0, 0, w, h, { fillCanvas: true, style: 'dark' })

  // Draw all routes
  polylines.forEach((poly, i) => {
    drawRouteOnTiles(ctx, poly, tileCtx.pixelOf, ROUTE_COLORS[i % ROUTE_COLORS.length], 3)
  })

  // Top header gradient + text
  const headerH = 140
  const topGrad = ctx.createLinearGradient(0, 0, 0, headerH)
  topGrad.addColorStop(0,   'rgba(0,0,0,0.80)')
  topGrad.addColorStop(0.8, 'rgba(0,0,0,0.20)')
  topGrad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = topGrad; ctx.fillRect(0, 0, w, headerH)

  const PAD = 48
  ctx.font = `bold 40px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8
  ctx.fillText('Le mie escursioni', PAD, PAD + 38)
  if (opts.showCount) {
    ctx.font = `20px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.shadowBlur = 4
    ctx.fillText(
      `${activities.length} percors${activities.length === 1 ? 'o' : 'i'} registrat${activities.length === 1 ? 'o' : 'i'}`,
      PAD, PAD + 72,
    )
  }
  ctx.shadowBlur = 0

  drawWatermark(ctx, w, h, true)
  return canvas.toDataURL('image/png')
}
