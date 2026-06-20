// Satellite signal collector — Sentinel-2 vegetation/water/burn/soil indices
// via the Copernicus Data Space Ecosystem (CDSE) Sentinel Hub Statistics API.
// Entirely gated behind COPERNICUS_CLIENT_ID/SECRET: if absent, this collector
// makes zero external calls and returns a neutral, unavailable signal — every
// other SI collector keeps working without it.
import type { SatelliteSignal, SignalContext } from '@/lib/si/types'

const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const STATISTICS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics'
const TIMEOUT_MS = 5000

let cachedToken: string | null = null
let tokenExpiresAt = 0

/** OAuth2 client-credentials token, cached in-memory (capped at 600s) — also reused by computeSentinel2.ts. */
export async function getCdseToken(): Promise<string | null> {
  const clientId = process.env.COPERNICUS_CLIENT_ID
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`CDSE auth error ${res.status}`)
  const d = await res.json()
  cachedToken = d.access_token
  tokenExpiresAt = Date.now() + Math.min(d.expires_in ?? 600, 600) * 1000 - 5000
  return cachedToken
}

const COMBINED_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B02","B03","B04","B08","B11","B12","dataMask"],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndwi", bands: 1, sampleType: "FLOAT32" },
      { id: "nbr", bands: 1, sampleType: "FLOAT32" },
      { id: "evi", bands: 1, sampleType: "FLOAT32" },
      { id: "bsi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 },
    ],
  }
}
function evaluatePixel(s) {
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04)
  const ndwi = (s.B03 - s.B08) / (s.B03 + s.B08)
  const nbr  = (s.B08 - s.B12) / (s.B08 + s.B12)
  const evi  = 2.5 * (s.B08 - s.B04) / (s.B08 + 6 * s.B04 - 7.5 * s.B02 + 1)
  const bsi  = ((s.B11 + s.B04) - (s.B08 + s.B02)) / ((s.B11 + s.B04) + (s.B08 + s.B02))
  return { ndvi: [ndvi], ndwi: [ndwi], nbr: [nbr], evi: [evi], bsi: [bsi], dataMask: [s.dataMask] }
}`

const NDVI_ONLY_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: ["B04","B08","dataMask"], output: [{ id: "ndvi", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }] }
}
function evaluatePixel(s) {
  return { ndvi: [(s.B08 - s.B04) / (s.B08 + s.B04)], dataMask: [s.dataMask] }
}`

async function runStatistics(
  token: string,
  bbox: SignalContext['bbox'],
  evalscript: string,
  from: Date,
  to: Date,
  outputIds: string[],
): Promise<Record<string, number | null>> {
  const body = {
    input: {
      bounds: {
        bbox: [bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat],
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{ type: 'sentinel-2-l2a' }],
    },
    aggregation: {
      timeRange: { from: from.toISOString(), to: to.toISOString() },
      aggregationInterval: { of: 'P370D' }, // wider than any range used here → single bucket
      evalscript,
      resx: 10,
      resy: 10,
    },
    calculations: Object.fromEntries(outputIds.map(id => [id, { statistics: { default: {} } }])),
  }

  const res = await fetch(STATISTICS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`CDSE statistics error ${res.status}`)
  const d = await res.json()
  const bucket = d.data?.[0]?.outputs

  const out: Record<string, number | null> = {}
  for (const id of outputIds) out[id] = bucket?.[id]?.bands?.B0?.stats?.mean ?? null
  return out
}

export async function collectSatelliteSignal(_osmRelationId: number, ctx: SignalContext): Promise<SatelliteSignal> {
  const neutral: SatelliteSignal = {
    available: false, ndviDeltaPenalty: 0, ndviAbsolutePenalty: 0, firePenalty: 0, floodPenalty: 0, landslidePenalty: 0,
  }

  let token: string | null
  try {
    token = await getCdseToken()
  } catch (err) {
    console.error('[si] CDSE auth failed', err)
    return { ...neutral, reason: 'auth_failed' }
  }
  if (!token) return { ...neutral, reason: 'missing_credentials' }

  try {
    const now = new Date()
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    const priorEnd = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const priorStart = new Date(priorEnd.getTime() - 10 * 24 * 60 * 60 * 1000)

    const [current, prior] = await Promise.all([
      runStatistics(token, ctx.bbox, COMBINED_EVALSCRIPT, tenDaysAgo, now, ['ndvi', 'ndwi', 'nbr', 'evi', 'bsi']),
      runStatistics(token, ctx.bbox, NDVI_ONLY_EVALSCRIPT, priorStart, priorEnd, ['ndvi']),
    ])

    const ndviCurrent = current.ndvi
    const ndviPrior = prior.ndvi
    const ndviDelta = ndviCurrent != null && ndviPrior != null ? ndviCurrent - ndviPrior : null

    return {
      available: true,
      ndviDeltaPenalty: ndviDeltaPenaltyFor(ndviDelta),
      ndviAbsolutePenalty: ndviAbsolutePenaltyFor(ndviCurrent),
      firePenalty: firePenaltyFor(current.nbr),
      floodPenalty: floodPenaltyFor(current.ndwi),
      landslidePenalty: landslidePenaltyFor(current.bsi),
    }
  } catch (err) {
    console.error('[si] CDSE statistics failed', err)
    return { ...neutral, reason: 'api_error' }
  }
}

function ndviDeltaPenaltyFor(delta: number | null): number {
  if (delta == null) return 0
  const abs = Math.abs(delta)
  if (abs < 0.05) return 0
  if (abs < 0.10) return -10
  if (abs < 0.20) return -20
  return -35
}

function ndviAbsolutePenaltyFor(ndvi: number | null): number {
  if (ndvi == null) return 0
  if (ndvi < 0.5) return 0
  if (ndvi <= 0.7) return -5
  return -15
}

function firePenaltyFor(nbr: number | null): number {
  if (nbr == null) return 0
  if (nbr < -0.1) return -50
  if (nbr < -0.05) return -25
  return 0
}

function floodPenaltyFor(ndwi: number | null): number {
  if (ndwi == null) return 0
  if (ndwi > 0.3) return -30
  if (ndwi > 0.2) return -15
  return 0
}

function landslidePenaltyFor(bsi: number | null): number {
  if (bsi == null) return 0
  if (bsi > 0.5) return -25
  if (bsi > 0.3) return -10
  return 0
}
