// CARG (Carta Geologica d'Italia) — lithology lookup at a single point via WMS GetFeatureInfo.
// Mirrors lib/pai/paiClient.ts's shape, but the query is point-based (WMS GetFeatureInfo), not
// bbox-based (WFS GetFeature) — see lib/geo/wmsClient.ts. GEOLOGIA_DATASET.protocol is WMS
// pending confirmation (see lib/geo/datasetConfig.ts); if a real endpoint turns out to expose a
// WFS for the lithology attribute table instead, swap wmsGetFeatureInfo for wfsGetFeature here,
// not at any call site.
import { GEOLOGIA_DATASET } from '@/lib/geo/datasetConfig'
import { wmsGetFeatureInfo } from '@/lib/geo/wmsClient'
import { lithologyCodeToRockfallRisk, type RockfallRisk } from '@/lib/geologia/lithologyRiskMap'

export interface GeologiaFeature {
  lithologyCode: string | null
  rockfallRisk: RockfallRisk
  rawProperties: Record<string, unknown>
}

// Thrown when GEOLOGIA_DATASET isn't configured yet (baseUrl/layerName still null per
// datasetConfig.ts) — callers must treat this exactly like "no data found", never let it
// interrupt the existing satellite signal pipeline in satelliteSignals.ts.
export class GeologiaUnavailableError extends Error {}

// Same budget reasoning as paiClient.ts's PAI_TIMEOUT_MS: stays inside computeSI.ts's 5s
// per-collector budget (COLLECTOR_TIMEOUT_MS).
const GEOLOGIA_TIMEOUT_MS = 4000

// Attribute-name guesses for the lithology code field in a CARG GetFeatureInfo response — as
// provisional as paiAttributeMap.ts's field lists, per-sheet legends vary the same way, just
// for a single code value instead of a risk class.
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

  const body = await wmsGetFeatureInfo({
    baseUrl: GEOLOGIA_DATASET.baseUrl,
    layerName: GEOLOGIA_DATASET.layerName,
    lat,
    lon,
    timeoutMs: GEOLOGIA_TIMEOUT_MS,
  })

  const props = extractProperties(body)
  const lithologyCode = extractLithologyCode(props)
  if (lithologyCode == null && Object.keys(props).length === 0) return null

  return {
    lithologyCode,
    rockfallRisk: lithologyCodeToRockfallRisk(lithologyCode),
    rawProperties: props,
  }
}
