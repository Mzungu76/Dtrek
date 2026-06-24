// PAI (Piano di Assetto Idrogeologico) — official landslide (R1-R4) and flood (P1-P4)
// risk polygons. Mosaicked nationally but published per Autorità di Bacino with varying
// attribute schemas (see paiAttributeMap.ts); this client assumes a single WFS typeName
// returns features of both risk types, distinguished per-feature by whichever attribute
// is present — revisit if a real endpoint turns out to split frane/alluvioni into two
// typeNames instead (extend lib/geo/datasetConfig.ts's PAI_DATASET, not this file).
import { PAI_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetFeature } from '@/lib/geo/wfsClient'
import { mapPaiAttributes } from '@/lib/pai/paiAttributeMap'
import type { AnyPolygonGeometry } from '@/lib/geo/pointInPolygon'

export type PaiRiskType = 'landslide' | 'flood'
export type PaiRiskClass = 'R1' | 'R2' | 'R3' | 'R4' | 'P1' | 'P2' | 'P3' | 'P4' | 'unknown'

export interface PaiFeature {
  geometry: AnyPolygonGeometry
  riskClass: PaiRiskClass
  riskType: PaiRiskType
  sourceAuthority: string | null
  rawAttributes: Record<string, unknown>
}

// Thrown when PAI_DATASET isn't configured yet (baseUrl/typeName still null per
// datasetConfig.ts) — callers must treat this exactly like "no data found", never let
// it interrupt the existing BSI/NDWI satellite fallback in satelliteSignals.ts.
export class PaiUnavailableError extends Error {}

// Tighter than wfsClient.ts's own 20s default: this runs inside computeSI.ts's 5s
// per-collector budget (COLLECTOR_TIMEOUT_MS), so failing fast matters more than
// tolerating a slow PAI server once one is actually configured.
const PAI_TIMEOUT_MS = 4000

export async function fetchPaiPolygons(bbox: string): Promise<PaiFeature[]> {
  if (!PAI_DATASET.baseUrl || !PAI_DATASET.typeName) {
    throw new PaiUnavailableError('PAI dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  const fc = await wfsGetFeature({
    baseUrl: PAI_DATASET.baseUrl,
    typeName: PAI_DATASET.typeName,
    bbox,
    timeoutMs: PAI_TIMEOUT_MS,
  })

  const features: PaiFeature[] = []
  for (const f of fc.features) {
    const mapped = mapPaiAttributes(f.properties ?? {}, f.geometry)
    if (mapped) features.push(mapped)
  }
  return features
}
