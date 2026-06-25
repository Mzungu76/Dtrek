// First WMS client in the repo (no precedent — wfsClient.ts covers vector fetch, this covers
// the GetFeatureInfo pixel-query protocol). GetFeatureInfo always needs a
// full BBOX+WIDTH/HEIGHT+I/J map-render context, even for a single point — this builds a tiny
// fixed pixel window centered exactly on (lat, lon), so the "queried point" is always the
// center pixel regardless of bufferM (which only changes ground resolution per pixel).

const USER_AGENT = 'DTrek/1.0 (personal hiking diary; mzulpt@gmail.com)'

const WINDOW_PX = 5 // odd, so the center pixel maps exactly to (lat, lon)
const CENTER_PX = Math.floor(WINDOW_PX / 2)

export interface WmsGetFeatureInfoOptions {
  baseUrl: string
  layerName: string
  lat: number
  lon: number
  /** Half-width in meters of the query window — only affects ground resolution per pixel, never which point is queried. */
  bufferM?: number
  infoFormat?: string
  version?: string
  timeoutMs?: number
  /** Escape hatch for server-specific params. */
  extraParams?: Record<string, string>
}

export async function wmsGetFeatureInfo(opts: WmsGetFeatureInfoOptions): Promise<unknown> {
  const {
    baseUrl, layerName, lat, lon,
    bufferM = 25,
    infoFormat = 'application/json',
    version = '1.3.0',
    timeoutMs = 20000,
    extraParams,
  } = opts

  const dLat = bufferM / 111320
  const dLon = bufferM / (111320 * Math.cos(lat * Math.PI / 180))
  const minLat = lat - dLat, maxLat = lat + dLat
  const minLon = lon - dLon, maxLon = lon + dLon

  // WMS 1.3.0 + CRS=EPSG:4326 uses lat,lon BBOX axis order per spec; 1.1.1 + SRS=EPSG:4326
  // uses the GIS-conventional lon,lat order. Getting this backwards silently shifts the
  // query window without erroring — verify against a real GetCapabilities before trusting it.
  const bboxStr = version === '1.3.0'
    ? `${minLat},${minLon},${maxLat},${maxLon}`
    : `${minLon},${minLat},${maxLon},${maxLat}`

  const params = new URLSearchParams({
    service: 'WMS',
    version,
    request: 'GetFeatureInfo',
    layers: layerName,
    query_layers: layerName,
    styles: '',
    bbox: bboxStr,
    width: String(WINDOW_PX),
    height: String(WINDOW_PX),
    info_format: infoFormat,
    feature_count: '1',
  })
  if (version === '1.3.0') {
    params.set('crs', 'EPSG:4326')
    params.set('i', String(CENTER_PX))
    params.set('j', String(CENTER_PX))
  } else {
    params.set('srs', 'EPSG:4326')
    params.set('x', String(CENTER_PX))
    params.set('y', String(CENTER_PX))
  }
  if (extraParams) for (const [k, v] of Object.entries(extraParams)) params.set(k, v)

  const url = `${baseUrl}?${params.toString()}`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`WMS ${layerName} GetFeatureInfo HTTP ${res.status} — ${body.slice(0, 300)}`)
  }

  return infoFormat.includes('json') ? res.json() : res.text()
}

/** Raw GetCapabilities XML, for probe scripts inspecting an endpoint's real layer names/formats. */
export async function wmsGetCapabilities(baseUrl: string, version = '1.3.0', timeoutMs = 20000): Promise<string> {
  const url = `${baseUrl}?service=WMS&version=${version}&request=GetCapabilities`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`WMS GetCapabilities HTTP ${res.status}`)
  return res.text()
}
