// Shared Microsoft Planetary Computer (MPC) access layer — STAC search +
// SAS token issuance + asset URL signing. This is the MPC-era equivalent of
// the old getCdseToken in lib/si/signals/satelliteSignals.ts: both lib/si
// and lib/sentinel2 import from here (one-way dependency stays the same
// shape, just pointed at a new shared module instead of at satelliteSignals.ts).
// MPC's STAC/SAS endpoints are public for low-volume use — no credentials
// are required to call them, unlike CDSE's OAuth2 client-credentials flow.
const STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
const SAS_TOKEN_URL = 'https://planetarycomputer.microsoft.com/api/sas/v1/token'
const TIMEOUT_MS = 6000

/** West, south, east, north — the STAC/GeoJSON bbox wire format. */
export type StacBbox = [number, number, number, number]

export interface StacItem {
  id: string
  properties?: Record<string, unknown>
  assets?: Record<string, { href: string; [key: string]: unknown }>
}

/** Thrown when a request never reached MPC (network failure, timeout/abort). */
export class MpcUnreachableError extends Error {}

/** Thrown when MPC answered but with a non-2xx status. */
export class MpcApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

function subscriptionHeaders(base: Record<string, string> = {}): Record<string, string> {
  const key = process.env.PLANETARY_COMPUTER_SUBSCRIPTION_KEY
  return key ? { ...base, 'Ocp-Apim-Subscription-Key': key } : base
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new MpcUnreachableError(String(err))
  }
  if (!res.ok) {
    throw new MpcApiError(`MPC error ${res.status}`, res.status)
  }
  return res.json()
}

/**
 * Searches a STAC collection over a bbox/date range, returning the single
 * best item or null if none qualify (a legitimate empty result, not an
 * error — maps to the 'no_data' UnavailableReason at the call site).
 * When maxCloudCover is set, filters/sorts by eo:cloud_cover ascending
 * (Sentinel-2); omit it for collections without that property, such as
 * MODIS composites, which instead sort by datetime descending.
 */
export async function searchStac(
  collection: string,
  bbox: StacBbox,
  dateFrom: Date,
  dateTo: Date,
  opts: { limit?: number; maxCloudCover?: number } = {},
): Promise<StacItem | null> {
  const { limit = 5, maxCloudCover } = opts
  const body: Record<string, unknown> = {
    collections: [collection],
    bbox,
    datetime: `${dateFrom.toISOString()}/${dateTo.toISOString()}`,
    limit,
  }
  if (maxCloudCover !== undefined) {
    body.query = { 'eo:cloud_cover': { lt: maxCloudCover } }
    body.sortby = [{ field: 'eo:cloud_cover', direction: 'asc' }]
  } else {
    body.sortby = [{ field: 'datetime', direction: 'desc' }]
  }

  const data = await fetchJson(STAC_SEARCH_URL, {
    method: 'POST',
    headers: subscriptionHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  const items = (data.features ?? []) as StacItem[]
  return items[0] ?? null
}

const sasCache = new Map<string, { token: string; expiresAt: number }>()

/** SAS token for a collection, cached in-memory until shortly before its msft:expiry. */
export async function getSasToken(collection: string): Promise<string> {
  const cached = sasCache.get(collection)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const data = await fetchJson(`${SAS_TOKEN_URL}/${collection}`, { headers: subscriptionHeaders() })
  const token = data.token as string
  const expiryMs = data['msft:expiry'] ? new Date(data['msft:expiry']).getTime() : Date.now() + 5 * 60 * 1000
  sasCache.set(collection, { token, expiresAt: expiryMs - 5000 })
  return token
}

/** Appends a SAS token querystring to an asset href. */
export function signAssetHref(href: string, sasToken: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}${sasToken}`
}

/** Asset href for a band on a STAC item, or null if absent. */
export function assetHref(item: StacItem, bandId: string): string | null {
  return item.assets?.[bandId]?.href ?? null
}

/** Reflectance scale/offset for a Sentinel-2 band from the STAC raster:bands extension, falling back to the standard L2A factor (0.0001, 0) when absent. */
export function bandScaleFor(item: StacItem, bandId: string): { scale: number; offset: number } {
  const bands = item.assets?.[bandId]?.['raster:bands'] as Array<{ scale?: number; offset?: number }> | undefined
  const band = bands?.[0]
  return { scale: band?.scale ?? 0.0001, offset: band?.offset ?? 0 }
}
