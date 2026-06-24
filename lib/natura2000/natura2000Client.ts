// Rete Natura 2000 (SIC/ZSC/ZPS) — protected-area polygons. Mirrors lib/pai/paiClient.ts's
// shape (single WFS typeName, bbox GetFeature, *UnavailableError contract) but without an
// attribute-map module: PAI's R1-R4/P1-P4 varies per Autorità di Bacino and needed a dedicated
// mapping file, while Natura2000's EU-standard schema is far more uniform — a small field-name
// candidate list here is enough, same spirit as geologiaClient.ts's LITHOLOGY_FIELDS. Falls back
// to designation:'unknown' (never fabricates SIC/ZSC/ZPS from an unrecognized value) — same
// "never invent a classification" discipline as lithologyRiskMap.ts.
import { NATURA2000_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetFeature } from '@/lib/geo/wfsClient'
import type { AnyPolygonGeometry } from '@/lib/geo/pointInPolygon'

export type Natura2000Designation = 'SIC' | 'ZSC' | 'ZPS' | 'unknown'

export interface Natura2000Feature {
  geometry: AnyPolygonGeometry
  siteCode: string | null
  siteName: string | null
  designation: Natura2000Designation
  habitatNotes: string | null
  rawAttributes: Record<string, unknown>
}

// Thrown when NATURA2000_DATASET isn't configured yet (baseUrl/typeName still null per
// datasetConfig.ts) — callers must treat this exactly like "no data found".
export class Natura2000UnavailableError extends Error {}

// Same budget reasoning as PAI_TIMEOUT_MS/GEOLOGIA_TIMEOUT_MS, though this client is never
// called from computeSI.ts's 5s collector budget (plan: "Nessun hook SI" for Natura2000) —
// kept tight anyway since it does run inside computeTEI's client-side fetch path.
const NATURA2000_TIMEOUT_MS = 4000

const SITE_CODE_FIELDS = ['sitecode', 'SITECODE', 'SITE_CODE', 'codice', 'CODICE', 'cod_sito', 'COD_SITO']
const SITE_NAME_FIELDS = ['sitename', 'SITENAME', 'SITE_NAME', 'nome', 'NOME', 'denominazione', 'DENOMINAZIONE']
const DESIGNATION_FIELDS = ['sitetype', 'SITETYPE', 'tipo', 'TIPO', 'designazione', 'DESIGNAZIONE', 'tipologia', 'TIPOLOGIA']
const HABITAT_FIELDS = ['habitat', 'HABITAT', 'habitat_principali', 'note', 'NOTE']

function firstStringField(props: Record<string, unknown>, fields: string[]): string | null {
  for (const f of fields) {
    const v = props[f]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return null
}

// Only matches an explicit SIC/ZSC/ZPS/SPA/SAC string in the field value — does not attempt to
// decode the EU SITETYPE A/B/C convention (A=ZPS-only, B=SIC/ZSC-only, C=overlap), since getting
// that letter-mapping wrong would silently mislabel every site. Revisit once a real endpoint's
// actual field values are inspected via scripts/probe-natura2000.ts.
function extractDesignation(props: Record<string, unknown>): Natura2000Designation {
  const raw = firstStringField(props, DESIGNATION_FIELDS)
  if (!raw) return 'unknown'
  const upper = raw.toUpperCase()
  if (upper.includes('ZSC')) return 'ZSC'
  if (upper.includes('SIC')) return 'SIC'
  if (upper.includes('ZPS') || upper.includes('SPA')) return 'ZPS'
  return 'unknown'
}

export async function fetchNatura2000Polygons(bbox: string): Promise<Natura2000Feature[]> {
  if (!NATURA2000_DATASET.baseUrl || !NATURA2000_DATASET.typeName) {
    throw new Natura2000UnavailableError('Natura2000 dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  const fc = await wfsGetFeature({
    baseUrl: NATURA2000_DATASET.baseUrl,
    typeName: NATURA2000_DATASET.typeName,
    bbox,
    timeoutMs: NATURA2000_TIMEOUT_MS,
  })

  const features: Natura2000Feature[] = []
  for (const f of fc.features) {
    if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue
    const props = f.properties ?? {}
    features.push({
      geometry: f.geometry as AnyPolygonGeometry,
      siteCode: firstStringField(props, SITE_CODE_FIELDS),
      siteName: firstStringField(props, SITE_NAME_FIELDS),
      designation: extractDesignation(props),
      habitatNotes: firstStringField(props, HABITAT_FIELDS),
      rawAttributes: props,
    })
  }
  return features
}
