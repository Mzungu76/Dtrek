// Land-cover client — vector WFS, not raster WCS (corrected after real GetCapabilities
// inspection: USO_SUOLO_DATASET's endpoint is a wfs:WFS_Capabilities document, no WCS
// operation exists there). Bbox GetFeature + point-in-polygon classification, rather than
// lib/dtm/dtmClient.ts's raster-tile shape. Same dual-failure-mode contract as every other geo
// client here: USO_SUOLO_DATASET not
// configured (baseUrl/typeName still null per datasetConfig.ts) is a static fact ->
// throws UsoSuoloUnavailableError; configured but no feature covers a given point is a
// per-request fact -> sampleLandCoverAtPoint returns null.
import { USO_SUOLO_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetFeature } from '@/lib/geo/wfsClient'
import { pointInPolygon, type AnyPolygonGeometry } from '@/lib/geo/pointInPolygon'
import { isCircuitOpen, recordFailure, recordSuccess } from '@/lib/geo/circuitBreaker'

export class UsoSuoloUnavailableError extends Error {}

// Same reasoning as natura2000Client.ts's 'natura2000-wfs' breaker — same class of flaky
// ISPRA/MASE geoportal endpoint.
const BREAKER_KEY = 'usosuolo-wfs'

export interface UsoSuoloFeature {
  geometry: AnyPolygonGeometry
  classCode: number | null
}

export interface UsoSuoloTile {
  features: UsoSuoloFeature[]
}

// Same budget reasoning as DTM_TIMEOUT_MS in dtmClient.ts: this runs once per bbox inside
// trailTerrainProfile.ts.
const USO_SUOLO_TIMEOUT_MS = 8000

// CLC class-code field-name candidates for the real endpoint (lc:clc18_it_4258) — provisional
// like every other *_FIELDS list in this codebase (LITHOLOGY_FIELDS, SITE_CODE_FIELDS, etc.),
// pending a real DescribeFeatureType response. Never fabricates a code from an unrecognized
// field — landCoverCodeToSurface(null) degrades to 'unknown', same as the rest of the pipeline.
const CLASS_CODE_FIELDS = ['Code_18', 'CODE_18', 'code_18', 'CLC18', 'clc18', 'classe', 'CLASSE']

function extractClassCode(props: Record<string, unknown>): number | null {
  for (const f of CLASS_CODE_FIELDS) {
    const v = props[f]
    if (v == null) continue
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return null
}

export async function fetchUsoSuoloTile(bbox: string): Promise<UsoSuoloTile | null> {
  if (!USO_SUOLO_DATASET.baseUrl || !USO_SUOLO_DATASET.typeName) {
    throw new UsoSuoloUnavailableError('Uso suolo dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  if (isCircuitOpen(BREAKER_KEY)) return null

  try {
    const fc = await wfsGetFeature({
      baseUrl: USO_SUOLO_DATASET.baseUrl,
      typeName: USO_SUOLO_DATASET.typeName,
      bbox,
      timeoutMs: USO_SUOLO_TIMEOUT_MS,
    })
    recordSuccess(BREAKER_KEY)

    const features: UsoSuoloFeature[] = []
    for (const f of fc.features) {
      if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) continue
      features.push({
        geometry: f.geometry as AnyPolygonGeometry,
        classCode: extractClassCode(f.properties ?? {}),
      })
    }
    return { features }
  } catch {
    recordFailure(BREAKER_KEY)
    return null
  }
}

/** Land-cover class code of whichever CLC polygon contains the point. Returns null if no feature covers it — never extrapolates. */
export function sampleLandCoverAtPoint(tile: UsoSuoloTile, lat: number, lon: number): number | null {
  for (const f of tile.features) {
    if (pointInPolygon(lat, lon, f.geometry)) return f.classCode
  }
  return null
}
