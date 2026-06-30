// Generalizes the WFS 2.0.0 GetFeature pattern already used ad hoc for GNA in
// app/api/pois/route.ts (fetchGnaPois) — that code is left untouched; new geo
// clients (PAI, Natura2000) call this instead.

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

export interface WfsGetFeatureOptions {
  baseUrl: string
  typeName: string
  /** "s,w,n,e" in srsName's axis order (lat/lon for EPSG:4326), same convention as geoUtils.ts's computeBbox. */
  bbox: string
  srsName?: string
  version?: string
  cqlFilter?: string
  outputFormat?: string
  count?: number
  timeoutMs?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: any[]
}

export async function wfsGetFeature(opts: WfsGetFeatureOptions): Promise<GeoJsonFeatureCollection> {
  const {
    baseUrl, typeName, bbox,
    srsName = 'EPSG:4326',
    version = '2.0.0',
    cqlFilter,
    outputFormat = 'application/json',
    count = 1000,
    timeoutMs = 20000,
  } = opts

  const [s, w, n, e] = bbox.split(',')
  const params = new URLSearchParams({
    service: 'WFS',
    version,
    request: 'GetFeature',
    typeName,
    bbox: `${w},${s},${e},${n},${srsName}`,
    outputFormat,
    count: String(count),
  })
  if (cqlFilter) params.set('cql_filter', cqlFilter)

  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.toString()}`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`WFS ${typeName} HTTP ${res.status} — ${body.slice(0, 300)}`)
  }

  return res.json()
}

/**
 * Same request shape as wfsGetFeature, but for endpoints whose only GetFeature outputFormat
 * is GML — confirmed necessary for Natura2000's legacy MapServer endpoint (real GetCapabilities
 * lists only "text/xml; subtype=gml/3.1.1", no JSON option). Returns raw text; callers parse
 * the GML themselves (no generic GML parser lives here — see natura2000Client.ts). version
 * defaults to 1.1.0 since that's this dataset's confirmed version, not 2.0.0's default above.
 */
export async function wfsGetFeatureGml(opts: WfsGetFeatureOptions): Promise<string> {
  const {
    baseUrl, typeName, bbox,
    srsName = 'EPSG:4326',
    version = '1.1.0',
    cqlFilter,
    outputFormat = 'text/xml; subtype=gml/3.1.1',
    count = 1000,
    timeoutMs = 20000,
  } = opts

  const [s, w, n, e] = bbox.split(',')
  const params = new URLSearchParams({
    service: 'WFS',
    version,
    request: 'GetFeature',
    typeName,
    bbox: `${w},${s},${e},${n},${srsName}`,
    outputFormat,
  })
  // WFS 1.1.0/1.0.0 paginate via maxFeatures; count is a 2.0.0-ism — same per-version
  // param-name split this client already makes for bbox/srsName.
  params.set(version === '2.0.0' ? 'count' : 'maxFeatures', String(count))
  if (cqlFilter) params.set('cql_filter', cqlFilter)

  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.toString()}`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`WFS ${typeName} GetFeature (GML) HTTP ${res.status} — ${body.slice(0, 300)}`)
  }

  return res.text()
}

/** Raw GetCapabilities XML, for probe scripts inspecting an endpoint's real typeNames/attributes. */
export async function wfsGetCapabilities(baseUrl: string, version = '2.0.0', timeoutMs = 20000): Promise<string> {
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}service=WFS&version=${version}&request=GetCapabilities`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`WFS GetCapabilities HTTP ${res.status}`)
  return res.text()
}
