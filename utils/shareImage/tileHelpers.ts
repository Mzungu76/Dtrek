import { rr } from './canvasHelpers'

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

export async function drawTiledMap(
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
        .catch(() => { ctx.fillStyle = style === 'dark' ? '#1a1a2e' : '#e8e8e8'; ctx.fillRect(px0, py0, px1 - px0, py1 - py0) })
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
export function drawRouteOnTiles(
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
