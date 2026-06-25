// DTM backend — OpenTopography Global DEM REST API (portal.opentopography.org), replacing
// the never-reachable TINITALY/INGV WCS pivot (host always denied, no GetCapabilities ever
// inspected) and the earlier-abandoned LiDAR 1m PST-A option (manual per-tile download,
// incompatible with this product's "zero manualità utente" constraint). Endpoint/params are
// from OpenTopography's public API docs (portal.opentopography.org/apidocs/) — NOT checked
// against a real response from this sandbox, since egress to portal.opentopography.org is
// policy-denied here (same restriction already documented for tinitaly.pi.ingv.it). Verify
// with scripts/probe-dtm.ts and a real OPENTOPOGRAPHY_API_KEY before trusting this in
// production — same discipline as every other dataset client in this repo.
const BASE_URL = 'https://portal.opentopography.org/API/globaldem'

// EU_DTM = Copernicus EU-DEM (~25-30m): a true digital TERRAIN model (bare ground), unlike
// the DSM alternatives this API also offers (SRTM GL1, ALOS World 3D, COP30) which include
// canopy/building height and would add noise to trail slope/aspect. Covers all of Italy.
const DEFAULT_DEMTYPE = 'EU_DTM'

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'
const DEFAULT_TIMEOUT_MS = 30000

/** Thrown when OpenTopography answers but with a non-2xx status (bad/missing key, rate limit, bad params). */
export class OpenTopographyApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export interface FetchGlobalDemOptions {
  demtype?: string
  timeoutMs?: number
}

/**
 * Fetches a GeoTIFF DEM tile for bbox = "s,w,n,e" (EPSG:4326, same convention as the rest of
 * the repo). Throws if OPENTOPOGRAPHY_API_KEY isn't set — dtmClient.ts's fetchDtmTile is the
 * boundary that turns that into the "dataset not configured" contract (DtmUnavailableError).
 */
export async function fetchGlobalDem(bbox: string, opts: FetchGlobalDemOptions = {}): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENTOPOGRAPHY_API_KEY
  if (!apiKey) throw new Error('OPENTOPOGRAPHY_API_KEY not set (see .env.example)')

  const [s, w, n, e] = bbox.split(',')
  const params = new URLSearchParams({
    demtype: opts.demtype ?? DEFAULT_DEMTYPE,
    south: s,
    north: n,
    west: w,
    east: e,
    outputFormat: 'GTiff',
    API_Key: apiKey,
  })

  const res = await fetch(`${BASE_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new OpenTopographyApiError(`OpenTopography globaldem HTTP ${res.status} — ${body.slice(0, 300)}`, res.status)
  }

  return res.arrayBuffer()
}
