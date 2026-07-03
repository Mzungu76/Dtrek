// Proxies CARG geologia WMS GetMap tiles through our own origin — same reasoning and shape as
// app/api/tile/route.ts (the base map tiles): MapLibre GL loads raster tiles as images with
// crossOrigin set, to upload them as WebGL textures, and this ArcGIS Server (like most Italian
// PA GIS services) doesn't send Access-Control-Allow-Origin — every tile request made directly
// from the browser fails silently (no console error visible to the user, the layer just never
// draws anything). Fetching server-side and re-serving from our own origin sidesteps that.
import { GEOLOGIA_DATASET } from '@/lib/geo/datasetConfig'

export const dynamic = 'force-dynamic'

// Standard Web Mercator (EPSG:3857) constants — same math used by every XYZ tile scheme.
const EARTH_RADIUS_M = 6378137
const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS_M // ≈ 20037508.342789244

/** XYZ tile (z/x/y, y growing downward) → [minX, minY, maxX, maxY] in EPSG:3857 meters. */
function tileToBBox3857(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z
  const tileSizeM = (2 * ORIGIN_SHIFT) / n
  const minX = -ORIGIN_SHIFT + x * tileSizeM
  const maxX = -ORIGIN_SHIFT + (x + 1) * tileSizeM
  const maxY = ORIGIN_SHIFT - y * tileSizeM
  const minY = ORIGIN_SHIFT - (y + 1) * tileSizeM
  return [minX, minY, maxX, maxY]
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const zRaw = searchParams.get('z')
  const xRaw = searchParams.get('x')
  const yRaw = searchParams.get('y')

  if (!zRaw || !xRaw || !yRaw) return new Response('Missing z/x/y', { status: 400 })
  const zoom = Number(zRaw), x = Number(xRaw), y = Number(yRaw)
  // Same strict integer + range validation as /api/tile/route.ts — z/x/y feed straight into
  // the bbox math and the upstream request below.
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 19) return new Response('Invalid zoom', { status: 400 })
  const maxTileIndex = 2 ** zoom - 1
  if (!Number.isInteger(x) || x < 0 || x > maxTileIndex) return new Response('Invalid x', { status: 400 })
  if (!Number.isInteger(y) || y < 0 || y > maxTileIndex) return new Response('Invalid y', { status: 400 })

  if (!GEOLOGIA_DATASET.baseUrl || !GEOLOGIA_DATASET.layerName) {
    return new Response('Geologia dataset not configured', { status: 503 })
  }

  const [minX, minY, maxX, maxY] = tileToBBox3857(zoom, x, y)
  const params = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetMap',
    layers: GEOLOGIA_DATASET.layerName, styles: '', crs: 'EPSG:3857',
    bbox: `${minX},${minY},${maxX},${maxY}`, width: '256', height: '256',
    format: 'image/png', transparent: 'true',
  })
  const url = `${GEOLOGIA_DATASET.baseUrl}?${params.toString()}`

  // Confirmed via a direct probe against this exact endpoint: it returns a genuine
  // `503 Service Unavailable` ("no server available to handle this request") — a classic
  // ArcGIS Server instance-pool exhaustion, not a request-parameter problem — whenever many
  // tiles for this layer are requested in a short burst (a hiker zoomed in close, where
  // MapLibre needs dozens of small tiles to cover one screen). A 503 from an instance-pool
  // limit is normally transient (a slot frees up within moments), so a couple of short
  // retries recovers most of them instead of surfacing every one as a permanently missing
  // tile. maxzoom on the raster source (NavigationMapLibre.tsx) caps how many distinct tiles
  // we ever request in the first place; this retry covers the ones that still collide.
  const RETRY_DELAYS_MS = [250, 600]
  let lastStatus = 0
  let lastBody = ''
  let lastContentType = ''

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DTrek/1.0 (personal trekking diary)', Accept: 'image/png' },
        // Only the first attempt is cacheable — a retry exists specifically to get past a
        // transient failure, so it must hit the upstream again, never a cached failed response.
        ...(attempt === 0 ? { next: { revalidate: 86400 } } : { cache: 'no-store' as const }),
      })
      const contentType = res.headers.get('content-type') ?? ''
      if (res.ok && contentType.startsWith('image/')) {
        const buf = await res.arrayBuffer()
        return new Response(buf, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
      // WMS servers report request-level problems (bad CRS, scale out of range, invalid
      // bbox...) as a ServiceException — sometimes with a non-2xx HTTP status, sometimes
      // with a 200 and an XML/text body instead of an image. Only retry a 503 (transient
      // pool exhaustion); anything else is a real request problem retrying won't fix.
      lastStatus = res.status
      lastContentType = contentType
      lastBody = await res.text().catch(() => '')
      if (res.status !== 503 || attempt === RETRY_DELAYS_MS.length) break
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    } catch (e) {
      lastStatus = 0
      lastBody = String(e)
      if (attempt === RETRY_DELAYS_MS.length) break
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }

  console.error(`[geologia-tile] upstream ${lastStatus || 'fetch failed'} for z=${zoom} x=${x} y=${y} (content-type: ${lastContentType}): ${lastBody.slice(0, 500)} — request: ${url}`)
  return new Response(
    `Upstream WMS error ${lastStatus || 'fetch failed'} (${lastContentType || 'unknown content-type'}): ${lastBody.slice(0, 500)}`,
    { status: 502 },
  )
}
