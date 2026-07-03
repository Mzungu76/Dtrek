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

  // WMS 1.3.0 GetMap over the WMS compatibility bridge.
  const wmsParams = new URLSearchParams({
    service: 'WMS', version: '1.3.0', request: 'GetMap',
    layers: GEOLOGIA_DATASET.layerName, styles: '', crs: 'EPSG:3857',
    bbox: `${minX},${minY},${maxX},${maxY}`, width: '256', height: '256',
    format: 'image/png', transparent: 'true',
  })
  const wmsUrl = `${GEOLOGIA_DATASET.baseUrl}?${wmsParams.toString()}`

  // Native Esri REST "export" operation — a different code path in ArcGIS Server than the WMS
  // bridge above (REST lives under /rest/services/, the WMS bridge under plain /services/).
  // Confirmed via repeated direct probes (isolated single requests, no concurrency, minutes
  // apart) that the WMS GetMap path consistently returns `503 Service Unavailable — no server
  // available to handle this request` — not a transient burst-of-concurrent-requests problem
  // (retries don't help either), which points at the WMS/GetMap capability specifically being
  // unavailable or disabled on this ArcGIS Server instance, independent of how we call it. The
  // REST export operation is a distinct, often more reliable capability on the same underlying
  // service (GetFeatureInfo via WMS already works fine elsewhere in this app — lib/geologia/
  // geologiaClient.ts — so the service itself is up; only image rendering via WMS seems to be
  // the problem), so it's tried first here, with the WMS GetMap path kept as a fallback.
  const restExportUrl = GEOLOGIA_DATASET.baseUrl.replace('/services/', '/rest/services/').replace(/\/WMSServer$/, '/export')
  const restParams = new URLSearchParams({
    bbox: `${minX},${minY},${maxX},${maxY}`, bboxSR: '3857', imageSR: '3857',
    size: '256,256', format: 'png32', transparent: 'true',
    layers: `show:${GEOLOGIA_DATASET.layerName}`, f: 'image',
  })
  const restUrl = `${restExportUrl}?${restParams.toString()}`

  type FetchAttemptResult =
    | { ok: true; buf: ArrayBuffer }
    | { ok: false; status: number; contentType: string; body: string }

  // A 503 from an instance-pool limit is normally transient (a slot frees up within moments),
  // so a couple of short retries recovers it without surfacing every one as a permanently
  // missing tile — kept from the earlier fix, still useful for genuinely transient blips even
  // though the sustained 503s observed on the WMS path turned out not to be one.
  const RETRY_DELAYS_MS = [250, 600]

  async function tryFetch(url: string): Promise<FetchAttemptResult> {
    let status = 0, contentType = '', body = ''
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'DTrek/1.0 (personal trekking diary)', Accept: 'image/png' },
          // Only the first attempt is cacheable — a retry exists specifically to get past a
          // transient failure, so it must hit the upstream again, never a cached failed response.
          ...(attempt === 0 ? { next: { revalidate: 86400 } } : { cache: 'no-store' as const }),
        })
        contentType = res.headers.get('content-type') ?? ''
        if (res.ok && contentType.startsWith('image/')) return { ok: true, buf: await res.arrayBuffer() }
        status = res.status
        body = await res.text().catch(() => '')
        if (status !== 503 || attempt === RETRY_DELAYS_MS.length) break
      } catch (e) {
        status = 0
        body = String(e)
        if (attempt === RETRY_DELAYS_MS.length) break
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
    return { ok: false, status, contentType, body }
  }

  const restResult = await tryFetch(restUrl)
  if (restResult.ok) {
    return new Response(restResult.buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const wmsResult = await tryFetch(wmsUrl)
  if (wmsResult.ok) {
    return new Response(wmsResult.buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  console.error(
    `[geologia-tile] both upstream attempts failed for z=${zoom} x=${x} y=${y} — ` +
    `REST ${restResult.status || 'fetch failed'} (${restResult.contentType}): ${restResult.body.slice(0, 300)} [${restUrl}] — ` +
    `WMS ${wmsResult.status || 'fetch failed'} (${wmsResult.contentType}): ${wmsResult.body.slice(0, 300)} [${wmsUrl}]`,
  )
  return new Response(
    `Upstream errors — REST ${restResult.status || 'fetch failed'}: ${restResult.body.slice(0, 300)} | WMS ${wmsResult.status || 'fetch failed'}: ${wmsResult.body.slice(0, 300)}`,
    { status: 502 },
  )
}
