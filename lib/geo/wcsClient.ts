// First WCS client in the repo (no precedent — Sentinel2/rasterIndices.ts only ever
// fetches whole pre-published COGs via geotiff's fromUrl, never a server-rendered
// GetCoverage subset). Returns raw GeoTIFF bytes; decode with geotiff's fromArrayBuffer.

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

export interface WcsGetCoverageOptions {
  baseUrl: string
  coverageId: string
  /** "s,w,n,e" in EPSG:4326, same convention as the rest of the repo. */
  bbox: string
  /** WCS 2.0 subset axis labels vary by server (Lat/Long, N/E, y/x) — confirm via DescribeCoverage before first real use. */
  subsettingAxes?: { lat: string; lon: string }
  outputCrs?: string
  format?: string
  version?: string
  timeoutMs?: number
  /** Escape hatch for server-specific params (e.g. scaleSize) once a real endpoint's quirks are known. */
  extraParams?: Record<string, string>
}

export async function wcsGetCoverage(opts: WcsGetCoverageOptions): Promise<ArrayBuffer> {
  const {
    baseUrl, coverageId, bbox,
    subsettingAxes = { lat: 'Lat', lon: 'Long' },
    outputCrs = 'http://www.opengis.net/def/crs/EPSG/0/4326',
    format = 'image/tiff',
    version = '2.0.1',
    timeoutMs = 30000,
    extraParams,
  } = opts

  const [s, w, n, e] = bbox.split(',')
  const params = new URLSearchParams({
    service: 'WCS',
    version,
    request: 'GetCoverage',
    coverageId,
    format,
    outputCrs,
  })
  params.append('subset', `${subsettingAxes.lat}(${s},${n})`)
  params.append('subset', `${subsettingAxes.lon}(${w},${e})`)
  if (extraParams) for (const [k, v] of Object.entries(extraParams)) params.set(k, v)

  const url = `${baseUrl}?${params.toString()}`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`WCS ${coverageId} HTTP ${res.status} — ${body.slice(0, 300)}`)
  }

  return res.arrayBuffer()
}

/** Raw DescribeCoverage XML, for probe scripts inspecting a coverage's native CRS/resolution/extent. */
export async function wcsDescribeCoverage(baseUrl: string, coverageId: string, version = '2.0.1', timeoutMs = 20000): Promise<string> {
  const url = `${baseUrl}?service=WCS&version=${version}&request=DescribeCoverage&coverageId=${encodeURIComponent(coverageId)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`WCS DescribeCoverage HTTP ${res.status}`)
  return res.text()
}
