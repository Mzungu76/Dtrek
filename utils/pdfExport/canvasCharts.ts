// ── Canvas chart helpers ────────────────────────────────────────────────────────

export function mkCanvas(w: number, h: number, scale = 2) {
  const c = document.createElement('canvas')
  c.width = w * scale; c.height = h * scale
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  return { c, ctx }
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

/** y di Web Mercator per una latitudine in gradi — non lineare in lat, cresce più in fretta
 *  avvicinandosi ai poli. Prima questo file proiettava la latitudine linearmente: alle latitudini
 *  italiane (~42-46°N) il percorso risultava allungato di circa il 37% in orizzontale rispetto al
 *  verticale (B24) — la stessa distorsione che una mappa "equirettangolare" mostra sempre, tranne
 *  che qui non c'era nessuna base cartografica a fare da riferimento visivo per notarla. */
function mercatorY(latDeg: number): number {
  const lat = latDeg * Math.PI / 180
  return Math.log(Math.tan(Math.PI / 4 + lat / 2))
}

/** Fallback vector route (white background) */
export function chartRouteFallback(
  pts: [number, number][],
  w: number, h: number,
  lineColor = '#277134', // FOREST[600], lib/designTokens.ts — prima #166534 (verde-800 Tailwind)
): string {
  if (pts.length < 2) return ''
  const { c, ctx } = mkCanvas(w, h)
  const pad = 14
  const lats = pts.map(p => p[0]), lons = pts.map(p => p[1])
  const mercYs = lats.map(mercatorY)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minMY = Math.min(...mercYs), maxMY = Math.max(...mercYs)
  const lonR = maxLon - minLon || 0.001, myR = maxMY - minMY || 0.001
  const sc = Math.min((w - 2 * pad) / lonR, (h - 2 * pad) / myR)
  const xOff = pad + ((w - 2 * pad) - lonR * sc) / 2
  const yOff = pad + ((h - 2 * pad) - myR * sc) / 2
  const px = (lon: number) => xOff + (lon - minLon) * sc
  const py = (lat: number) => yOff + (maxMY - mercatorY(lat)) * sc

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
