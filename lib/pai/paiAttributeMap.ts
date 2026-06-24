// Attribute-name guesses for PAI WFS schemas, which vary per Autorità di Bacino — there
// is no single national attribute schema for PAI, unlike the geometry mosaic itself.
// This list is provisional: populate/extend it once a real endpoint's GetCapabilities/
// DescribeFeatureType has been inspected (see scripts/probe-pai.ts, per the plan's
// verification convention). A field name not on this list still surfaces the polygon
// with riskClass: 'unknown' rather than silently dropping it.
import type { AnyPolygonGeometry } from '@/lib/geo/pointInPolygon'
import type { PaiFeature, PaiRiskClass, PaiRiskType } from '@/lib/pai/paiClient'

const LANDSLIDE_FIELDS = ['classe_r', 'CLASSE_R', 'CLASSERISC', 'R_FRANA', 'classerisc', 'classe_rischio_frana', 'cod_classe_r']
const FLOOD_FIELDS = ['classe_p', 'CLASSE_P', 'P_ALLUVIONE', 'classe_pericolosita', 'fasce_pai', 'cod_classe_p']
const AUTHORITY_FIELDS = ['autorita', 'AUTORITA', 'ente', 'distretto', 'ADB', 'adbasin', 'autorita_bacino']

function firstAttribute(props: Record<string, unknown>, fields: string[]): unknown {
  for (const f of fields) {
    if (props[f] != null) return props[f]
  }
  return null
}

function normalizeClassValue(raw: unknown, type: PaiRiskType): PaiRiskClass {
  if (raw == null) return 'unknown'
  const prefix = type === 'landslide' ? 'R' : 'P'
  const match = String(raw).toUpperCase().match(new RegExp(`${prefix}\\s*([1-4])`))
  return match ? (`${prefix}${match[1]}` as PaiRiskClass) : 'unknown'
}

/** Maps raw WFS feature properties+geometry to a PaiFeature; null only when the geometry itself isn't a polygon (point/line features in the same layer, if any, aren't risk zones). */
export function mapPaiAttributes(
  props: Record<string, unknown>,
  geometry: AnyPolygonGeometry | null | undefined,
): PaiFeature | null {
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null

  const landslideRaw = firstAttribute(props, LANDSLIDE_FIELDS)
  const floodRaw = firstAttribute(props, FLOOD_FIELDS)
  const riskType: PaiRiskType = landslideRaw == null && floodRaw != null ? 'flood' : 'landslide'
  const raw = riskType === 'flood' ? floodRaw : landslideRaw

  return {
    geometry,
    riskClass: normalizeClassValue(raw, riskType),
    riskType,
    sourceAuthority: (firstAttribute(props, AUTHORITY_FIELDS) as string | null) ?? null,
    rawAttributes: props,
  }
}
