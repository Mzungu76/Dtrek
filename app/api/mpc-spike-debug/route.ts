// Spike diagnostico temporaneo — verifica reale di connettività verso
// Microsoft Planetary Computer da un ambiente Vercel reale (non sandbox),
// prima di investire nella riscrittura della pipeline satellitare CDSE→MPC.
// DA RIMUOVERE al termine della verifica, non è codice di prodotto.
import { NextResponse } from 'next/server'
import { fromUrl } from 'geotiff'

const STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
const SAS_TOKEN_URL = 'https://planetarycomputer.microsoft.com/api/sas/v1/token'
const TIMEOUT_MS = 10000

// Val Gardena (Dolomiti) — bbox di test arbitrario, nessun legame con dati utente.
const TEST_BBOX = [11.65, 46.55, 11.70, 46.58]

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

interface StacItem {
  id: string
  properties?: Record<string, unknown>
  assets?: Record<string, { href: string }>
}

export async function GET() {
  const steps: Record<string, unknown> = {}

  let item: StacItem | undefined
  try {
    const t0 = Date.now()
    const res = await fetch(STAC_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        bbox: TEST_BBOX,
        datetime: `${isoDaysAgo(60)}/${isoDaysAgo(0)}`,
        limit: 5,
        query: { 'eo:cloud_cover': { lt: 60 } },
        sortby: [{ field: 'eo:cloud_cover', direction: 'asc' }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const ms = Date.now() - t0
    if (!res.ok) {
      steps.stacSearch = { ok: false, status: res.status, ms, body: await res.text().catch(() => null) }
      return NextResponse.json({ steps })
    }
    const data = await res.json()
    item = data.features?.[0]
    steps.stacSearch = {
      ok: true, ms, featureCount: data.features?.length ?? 0,
      itemId: item?.id ?? null, cloudCover: item?.properties?.['eo:cloud_cover'] ?? null,
    }
    if (!item) return NextResponse.json({ steps })
  } catch (err) {
    steps.stacSearch = { ok: false, error: String(err) }
    return NextResponse.json({ steps })
  }

  let token: string | undefined
  try {
    const t0 = Date.now()
    const res = await fetch(`${SAS_TOKEN_URL}/sentinel-2-l2a`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const ms = Date.now() - t0
    if (!res.ok) {
      steps.sasToken = { ok: false, status: res.status, ms, body: await res.text().catch(() => null) }
      return NextResponse.json({ steps })
    }
    const data = await res.json()
    token = data.token
    steps.sasToken = { ok: true, ms, hasToken: !!token }
    if (!token) return NextResponse.json({ steps })
  } catch (err) {
    steps.sasToken = { ok: false, error: String(err) }
    return NextResponse.json({ steps })
  }

  try {
    const href = item.assets?.B04?.href
    if (!href) {
      steps.cogRead = { ok: false, error: 'no B04 asset href on STAC item' }
      return NextResponse.json({ steps })
    }
    const signedUrl = `${href}${href.includes('?') ? '&' : '?'}${token}`
    const t0 = Date.now()
    const tiff = await fromUrl(signedUrl)
    const image = await tiff.getImage()
    const raster = await image.readRasters({ window: [0, 0, 64, 64] })
    const ms = Date.now() - t0
    const firstBand = Array.isArray(raster) ? raster[0] : raster
    steps.cogRead = {
      ok: true, ms, width: image.getWidth(), height: image.getHeight(),
      sampleCount: (firstBand as { length?: number })?.length ?? null,
    }
  } catch (err) {
    steps.cogRead = { ok: false, error: String(err) }
  }

  return NextResponse.json({ steps })
}
