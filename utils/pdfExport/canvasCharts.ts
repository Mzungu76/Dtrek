// ── Canvas chart helpers ────────────────────────────────────────────────────────

export function mkCanvas(w: number, h: number, scale = 2) {
  const c = document.createElement('canvas')
  c.width = w * scale; c.height = h * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  return { c, ctx }
}

export function chartLine(
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

export function chartBar(
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
export function chartRouteFallback(
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
