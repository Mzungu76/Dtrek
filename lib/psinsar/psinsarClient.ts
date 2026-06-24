// PSInSAR — radar-derived ground deformation velocity (mm/anno), prodotto nazionale
// MASE (a differenza del PAI, non è mosaicato per Autorità di Bacino, quindi un solo
// elenco di nomi-campo plausibili basta, niente bisogno di un paiAttributeMap.ts-style
// modulo dedicato qui).
import { PSINSAR_DATASET } from '@/lib/geo/datasetConfig'
import { wfsGetFeature } from '@/lib/geo/wfsClient'

export interface PsinsarPoint {
  lat: number
  lon: number
  velocityMmYear: number // segno: negativo = subsidenza/movimento in allontanamento dal satellite, positivo = innalzamento
  coherence?: number
  sensor?: string
}

// Thrown when PSINSAR_DATASET isn't configured yet (baseUrl/typeName still null per
// datasetConfig.ts) — callers must treat this exactly like "no data found".
export class PsinsarUnavailableError extends Error {}

// Stesso budget stretto di paiClient.ts: questo gira dentro i 5s per-collector di
// computeSI.ts (COLLECTOR_TIMEOUT_MS).
const PSINSAR_TIMEOUT_MS = 4000

const VELOCITY_FIELDS = ['velocity', 'VEL', 'vel_mm_anno', 'MEAN_VEL', 'velocity_mm_yr', 'vel', 'velocita']
const COHERENCE_FIELDS = ['coherence', 'COERENZA', 'coerenza']
const SENSOR_FIELDS = ['sensor', 'sat', 'satellite', 'piattaforma']

function firstAttribute(props: Record<string, unknown>, fields: string[]): unknown {
  for (const f of fields) { if (props[f] != null) return props[f] }
  return null
}

interface GeoJsonPointGeometry { type: 'Point'; coordinates: [number, number] }

function mapPsinsarFeature(props: Record<string, unknown>, geometry: GeoJsonPointGeometry | null | undefined): PsinsarPoint | null {
  if (!geometry || geometry.type !== 'Point') return null
  const velocityRaw = firstAttribute(props, VELOCITY_FIELDS)
  if (velocityRaw == null) return null
  const velocityMmYear = Number(velocityRaw)
  if (!Number.isFinite(velocityMmYear)) return null

  const [lon, lat] = geometry.coordinates
  const coherenceRaw = firstAttribute(props, COHERENCE_FIELDS)
  const sensorRaw = firstAttribute(props, SENSOR_FIELDS)
  return {
    lat,
    lon,
    velocityMmYear,
    coherence: coherenceRaw != null ? Number(coherenceRaw) : undefined,
    sensor: sensorRaw != null ? String(sensorRaw) : undefined,
  }
}

export async function fetchPsinsarPoints(bbox: string): Promise<PsinsarPoint[]> {
  if (!PSINSAR_DATASET.baseUrl || !PSINSAR_DATASET.typeName) {
    throw new PsinsarUnavailableError('PSInSAR dataset endpoint not yet configured (see lib/geo/datasetConfig.ts)')
  }

  const fc = await wfsGetFeature({
    baseUrl: PSINSAR_DATASET.baseUrl,
    typeName: PSINSAR_DATASET.typeName,
    bbox,
    timeoutMs: PSINSAR_TIMEOUT_MS,
  })

  const points: PsinsarPoint[] = []
  for (const f of fc.features) {
    const mapped = mapPsinsarFeature(f.properties ?? {}, f.geometry)
    if (mapped) points.push(mapped)
  }
  return points
}
