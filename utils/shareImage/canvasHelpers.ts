export type ShareFormat = '1:1' | '16:9' | '9:16'

// ─── Canvas utils ─────────────────────────────────────────────────────────────

export const FONT = '"SF Pro Display", "Helvetica Neue", Arial, sans-serif'

// Dark palette (used for stats/comparison cards which don't use a map background)
export const DARK = {
  bgTop:      '#1a3c26',
  bgBot:      '#0e2118',
  accent:     '#5bc47a',
  white:      '#ffffff',
  muted:      'rgba(255,255,255,0.5)',
  cardBg:     'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.13)',
}

export function makeCanvas(fmt: ShareFormat): [HTMLCanvasElement, CanvasRenderingContext2D, number, number] {
  const [w, h] =
    fmt === '1:1'  ? [1080, 1080] :
    fmt === '9:16' ? [1080, 1920] :
                     [1200, 630]
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  return [canvas, canvas.getContext('2d')!, w, h]
}

// Portrait-ish formats (square + story) share most layout decisions:
// more vertical room, narrower columns than landscape.
export function isTall(fmt: ShareFormat): boolean { return fmt !== '16:9' }

export function drawDarkBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(w * 0.6, 0, 0, h)
  g.addColorStop(0, DARK.bgTop)
  g.addColorStop(1, DARK.bgBot)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 14) {
  rr(ctx, x, y, w, h, r)
  ctx.fillStyle = DARK.cardBg; ctx.fill()
  ctx.strokeStyle = DARK.cardBorder; ctx.lineWidth = 1; ctx.stroke()
}

// Branded logo lockup: small mountain glyph + "DTrek" wordmark, bottom-right.
export function drawLogo(ctx: CanvasRenderingContext2D, w: number, h: number, scale = 1) {
  ctx.save()
  const baseY = h - 30 * scale
  const txt   = 'DTrek'
  const fontPx = Math.round(22 * scale)
  ctx.font = `bold ${fontPx}px ${FONT}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  const txtW   = ctx.measureText(txt).width
  const rightX = w - 30 * scale
  const glyphR = 11 * scale                     // mountain glyph half-width
  const gap    = 9 * scale
  const glyphCx = rightX - txtW - gap - glyphR
  const glyphTop = baseY - fontPx * 0.78

  // Mountain glyph (two triangles) with subtle shadow for legibility on maps
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4 * scale
  ctx.fillStyle = DARK.accent
  ctx.beginPath()
  ctx.moveTo(glyphCx - glyphR,       baseY)
  ctx.lineTo(glyphCx - glyphR * 0.1, glyphTop)
  ctx.lineTo(glyphCx + glyphR * 0.5, baseY)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(glyphCx - glyphR * 0.2, baseY)
  ctx.lineTo(glyphCx + glyphR * 0.55, glyphTop + glyphR * 0.55)
  ctx.lineTo(glyphCx + glyphR,        baseY)
  ctx.closePath(); ctx.fill()

  // Wordmark
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(txt, rightX, baseY)
  ctx.restore()
}

// Elevation profile — filled area chart with peak marker. Drawn over a dark band.
export function drawElevationProfile(
  ctx: CanvasRenderingContext2D,
  profile: number[],
  x: number, y: number, w: number, h: number,
  scale = 1,
) {
  if (profile.length < 3) return
  const min = Math.min(...profile), max = Math.max(...profile)
  const range = max - min || 1
  const px = (i: number) => x + (i / (profile.length - 1)) * w
  const py = (v: number) => y + h - ((v - min) / range) * h

  // Area fill
  ctx.save()
  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, 'rgba(91,196,122,0.55)')
  grad.addColorStop(1, 'rgba(91,196,122,0.05)')
  ctx.beginPath()
  ctx.moveTo(px(0), y + h)
  profile.forEach((v, i) => ctx.lineTo(px(i), py(v)))
  ctx.lineTo(px(profile.length - 1), y + h)
  ctx.closePath()
  ctx.fillStyle = grad; ctx.fill()

  // Top line
  ctx.beginPath()
  profile.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))))
  ctx.strokeStyle = DARK.accent; ctx.lineWidth = 2.5 * scale
  ctx.lineJoin = 'round'; ctx.stroke()

  // Peak marker
  const peakI = profile.indexOf(max)
  const pkx = px(peakI), pky = py(max)
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(pkx, pky, 4 * scale, 0, Math.PI * 2); ctx.fill()
  ctx.font = `bold ${Math.round(15 * scale)}px ${FONT}`
  ctx.textAlign = pkx > x + w * 0.7 ? 'right' : 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4 * scale
  ctx.fillText(`${Math.round(max)} m`, pkx + (ctx.textAlign === 'right' ? -8 : 8) * scale, pky - 6 * scale)
  ctx.restore()
}

export function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  let t = text
  while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2) + '…'
  return t
}

// ─── Dark-bg abstract route (for stats/comparison pages) ──────────────────────

export function drawRouteAbstract(
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
