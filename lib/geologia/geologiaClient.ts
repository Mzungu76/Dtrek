// CARG (Carta Geologica d'Italia) — lithology lookup at a single point via WMS GetFeatureInfo
// (not bbox-based WFS GetFeature) — see lib/geo/wmsClient.ts. GEOLOGIA_DATASET.protocol confirmed
// WMS-only (ArcGIS Server at sinacloud.isprambiente.it, no WFS exposed for this layer) — see
// lib/geo/datasetConfig.ts.
import { GEOLOGIA_DATASET } from '@/lib/geo/datasetConfig'
import { wmsGetFeatureInfo } from '@/lib/geo/wmsClient'
import { isCircuitOpen, recordFailure, recordSuccess } from '@/lib/geo/circuitBreaker'
import { lithologyCodeToRockfallRisk, type RockfallRisk } from '@/lib/geologia/lithologyRiskMap'

// Breaker key for sinacloud.isprambiente.it — this ArcGIS Server is the endpoint observed
// cycling through 502/503/522 for extended periods (see lib/geo/circuitBreaker.ts).
const BREAKER_KEY = 'geologia-wms'

export interface GeologiaFeature {
  lithologyCode: string | null
  rockfallRisk: RockfallRisk
  rawProperties: Record<string, unknown>
}

// Thrown when GEOLOGIA_DATASET isn't configured yet (baseUrl/layerName still null per
// datasetConfig.ts) — callers must treat this exactly like "no data found".
export class GeologiaUnavailableError extends Error {}

const GEOLOGIA_TIMEOUT_MS = 4000

// Attribute-name guesses for the lithology code field in a CARG GetFeatureInfo response —
// per-sheet legends vary, so this list is provisional rather than confirmed.
const LITHOLOGY_FIELDS = ['sigla', 'SIGLA', 'sigla_geo', 'COD_LITO', 'cod_lito', 'litologia', 'LITOLOGIA']

function extractLithologyCode(props: Record<string, unknown>): string | null {
  for (const f of LITHOLOGY_FIELDS) {
    if (props[f] != null) return String(props[f])
  }
  return null
}

// info_format=application/json from a GeoServer-backed WMS nests properties exactly like a WFS
// feature (features[0].properties) — reusing that shape here rather than inventing a new one.
// Revisit once a real endpoint's actual GetFeatureInfo response has been inspected.
function extractProperties(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object' && 'features' in (body as Record<string, unknown>)) {
    const features = (body as { features?: unknown[] }).features
    if (Array.isArray(features) && features.length > 0) {
      const first = features[0] as { properties?: unknown }
      if (first.properties && typeof first.properties === 'object') {
        return first.properties as Record<string, unknown>
      }
    }
  }
  return {}
}

export async function fetchGeologiaAtPoint(lat: number, lon: number): Promise<GeologiaFeature | null> {
  if (!GEOLOGIA_DATASET.baseUrl || !GEOLOGIA_DATASET.layerName) {
    throw new GeologiaUnavailableError('Geologia dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  if (isCircuitOpen(BREAKER_KEY)) return null

  let body: unknown
  try {
    body = await wmsGetFeatureInfo({
      baseUrl: GEOLOGIA_DATASET.baseUrl,
      layerName: GEOLOGIA_DATASET.layerName,
      lat,
      lon,
      // This ArcGIS Server (sinacloud.isprambiente.it) doesn't support plain application/json
      // for GetFeatureInfo — confirmed against its real GetCapabilities format list (only
      // application/geo+json among the JSON-ish options). Response shape is still standard
      // GeoJSON, so extractProperties() below doesn't need to change.
      infoFormat: 'application/geo+json',
      timeoutMs: GEOLOGIA_TIMEOUT_MS,
    })
  } catch (e) {
    recordFailure(BREAKER_KEY)
    throw e
  }
  recordSuccess(BREAKER_KEY)

  const props = extractProperties(body)
  const lithologyCode = extractLithologyCode(props)
  if (lithologyCode == null && Object.keys(props).length === 0) return null

  return {
    lithologyCode,
    rockfallRisk: lithologyCodeToRockfallRisk(lithologyCode),
    rawProperties: props,
  }
}
