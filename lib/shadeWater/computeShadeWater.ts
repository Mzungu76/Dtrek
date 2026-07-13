// Ombra e Acqua — versione senza Sentinel-2/Planetary Computer/MODIS. La pipeline satellitare
// (ex lib/sentinel2/computeSentinel2.ts) causava timeout frequenti su /api/trails/sentinel2 e
// /api/trails/cl (Vercel "Task timed out after 30 seconds", centinaia di occorrenze), in modo
// sproporzionato sui percorsi appena importati: alla primissima computazione tutti i segnali
// devono girare insieme, e uno snapshot Sentinel-2 + 12 letture mensili MODIS da Planetary
// Computer è per sua natura lento e soggetto ai rate limit del livello gratuito.
//
// Sostituisce sia l'ombra che l'acqua con dati OpenStreetMap via Overpass (stessa fonte, stesso
// pattern già usato per V_idro/V_fond del TEI — vedi lib/tei.ts) — una sola query, nessuna
// dipendenza da servizi satellitari:
//   - Ombra: quota della lunghezza del tracciato che ricade dentro poligoni di bosco/foresta OSM
//     (natural=wood, landuse=forest).
//   - Acqua: punti entro 150m dal tracciato vicino a corsi d'acqua, sorgenti o sponde di laghi
//     OSM (natural=water, waterway=river/stream, natural=spring).
//
// Stessa forma di dato (Sentinel2Data, lib/cl/types.ts) per non dover toccare hook/route/
// componenti che la consumano (useSentinel2, ScoreRing, ShadeWaterTile, ecc.) — solo
// shadeScore/waterSources/available/computedAt sono popolati per davvero. I campi di fenologia
// satellitare (ndviMonthly, ndviDelta, fireDetected, floodDetected, landslideRisk,
// landscapeVariety, phenologyPeakMonth) restano sempre null/false: components/PhenologyPanel.tsx
// già tratta `!data.ndviMonthly` come "niente da mostrare", quindi quel pannello smette
// semplicemente di comparire, senza bisogno di toccarlo. Il rilevamento satellitare di incendi/
// alluvioni/frane per l'Affidabilità (lib/cl/signals/satelliteSignals.ts) è un fetch Planetary
// Computer indipendente e non viene toccato da questo cambiamento.
import { supabase } from '@/lib/supabase'
import { haversineM, computeBbox, minDistToTrack } from '@/lib/geoUtils'
import { fetchOverpass } from '@/lib/overpassTrails'
import { segmentGpx } from '@/lib/tei'
import { pointInPolygon, type PolygonGeometry } from '@/lib/geo/pointInPolygon'
import type { Sentinel2Data, UnavailableReason } from '@/lib/cl/types'

const WATER_PROXIMITY_M = 150
const MAX_WATER_SOURCES = 10
const OVERPASS_TIMEOUT_MS = 15000

// OSM forest/copertura d'acqua cambia pochissimo nel tempo — molto più lenta della vecchia serie
// mensile Sentinel-2/MODIS, quindi una scadenza lunga basta e riduce il traffico verso Overpass.
// Il nome SERIES_TTL_MS resta quello che app/api/trails/sentinel2/route.ts già importa per la
// sua logica "stale ma restituibile subito, ricalcolo in background" — ancora valida cosi com'è.
export const SERIES_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface OverpassGeomElement {
  type: 'node' | 'way' | 'relation'
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
  members?: Array<{ geometry?: Array<{ lat: number; lon: number }> }>
}

interface OverpassGeomResponse {
  elements: OverpassGeomElement[]
}

function sampleGeom<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr
  const step = Math.ceil(arr.length / maxPts)
  return arr.filter((_, i) => i % step === 0)
}

function ringFromGeometry(geom: Array<{ lat: number; lon: number }>): [number, number][] {
  return geom.map(p => [p.lon, p.lat])
}

interface ParsedOsm {
  forestPolygons: PolygonGeometry[]
  waterCandidates: Array<{ lat: number; lon: number }>
}

// Le relation (bosco/lago composti da più way) vengono trattate come poligoni/punti separati per
// ogni member way, senza distinguere outer/inner — stessa semplificazione già usata per i laghi
// grandi (es. Bolsena) in app/api/tei-overpass/route.ts, capata a 6 member per non gonfiare i dati.
function parseOverpassElements(elements: OverpassGeomElement[]): ParsedOsm {
  const forestPolygons: PolygonGeometry[] = []
  const waterCandidates: Array<{ lat: number; lon: number }> = []

  for (const el of elements) {
    const tags = el.tags ?? {}
    const isForest = tags.natural === 'wood' || tags.landuse === 'forest'
    const isWaterArea = tags.natural === 'water'
    const isWaterway = tags.waterway === 'river' || tags.waterway === 'stream'
    const isSpring = tags.natural === 'spring'

    if (isForest) {
      if (el.geometry && el.geometry.length >= 3) {
        forestPolygons.push({ type: 'Polygon', coordinates: [ringFromGeometry(el.geometry)] })
      } else if (el.members?.length) {
        for (const m of el.members.slice(0, 6)) {
          if (m.geometry && m.geometry.length >= 3) forestPolygons.push({ type: 'Polygon', coordinates: [ringFromGeometry(m.geometry)] })
        }
      }
      continue
    }

    if (isWaterArea) {
      if (el.geometry?.length) {
        for (const pt of sampleGeom(el.geometry, 30)) waterCandidates.push(pt)
      } else if (el.members?.length) {
        for (const m of el.members.slice(0, 6)) {
          if (m.geometry?.length) for (const pt of sampleGeom(m.geometry, 20)) waterCandidates.push(pt)
        }
      }
      continue
    }

    if (isWaterway && el.geometry?.length) {
      for (const pt of sampleGeom(el.geometry, 15)) waterCandidates.push(pt)
      continue
    }

    if (isSpring && el.type === 'node' && el.lat != null && el.lon != null) {
      waterCandidates.push({ lat: el.lat, lon: el.lon })
    }
  }

  return { forestPolygons, waterCandidates }
}

async function fetchOsmShadeWaterData(bbox: string): Promise<ParsedOsm> {
  const [s, w, n, e] = bbox.split(',')
  const query = `[out:json][timeout:15];
(
  way["natural"="wood"](${s},${w},${n},${e});
  way["landuse"="forest"](${s},${w},${n},${e});
  relation["natural"="wood"](${s},${w},${n},${e});
  relation["landuse"="forest"](${s},${w},${n},${e});
  way["natural"="water"](${s},${w},${n},${e});
  relation["natural"="water"](${s},${w},${n},${e});
  way["waterway"~"^(river|stream)$"](${s},${w},${n},${e});
  node["natural"="spring"](${s},${w},${n},${e});
);
out geom;`
  const data = await fetchOverpass<OverpassGeomResponse>(query, OVERPASS_TIMEOUT_MS)
  return parseOverpassElements(data.elements ?? [])
}

// Quota della lunghezza del tracciato (pesata per segmento, non un semplice conteggio) che
// ricade dentro un poligono di bosco/foresta — stesso principio di lib/tei.ts's computeVfond.
function computeForestCoverage(trailPoints: [number, number][], forestPolygons: PolygonGeometry[]): number {
  if (forestPolygons.length === 0) return 0
  const segments = segmentGpx(trailPoints)
  if (segments.length === 0) return 0

  let coveredLen = 0
  let totalLen = 0
  for (const seg of segments) {
    totalLen += seg.lengthM
    const [lat, lon] = seg.centroid
    if (forestPolygons.some(poly => pointInPolygon(lat, lon, poly))) coveredLen += seg.lengthM
  }
  return totalLen === 0 ? 0 : coveredLen / totalLen
}

// Punti d'acqua entro WATER_PROXIMITY_M dal tracciato, deduplicati grossolanamente (un lago
// grande non deve riempire da solo tutta la lista) — stesso limite MAX_WATER_SOURCES della
// vecchia pipeline basata su NDWI.
function computeWaterSources(
  trailPoints: [number, number][],
  candidates: Array<{ lat: number; lon: number }>,
): Array<{ lat: number; lon: number }> {
  const kept: Array<{ lat: number; lon: number }> = []
  for (const c of candidates) {
    if (kept.length >= MAX_WATER_SOURCES) break
    if (minDistToTrack(c.lat, c.lon, trailPoints) > WATER_PROXIMITY_M) continue
    if (kept.some(k => haversineM(k.lat, k.lon, c.lat, c.lon) < 50)) continue
    kept.push({ lat: c.lat, lon: c.lon })
  }
  return kept
}

export interface ShadeWaterCacheRow {
  shadeScore: number | null
  waterSources: Array<{ lat: number; lon: number }>
  computedAt: string | null
  available: boolean
}

const UNAVAILABLE: Omit<Sentinel2Data, 'osmRelationId' | 'plannedHikeId'> = {
  available: false, ndviMonthly: null, ndviDelta: null, ndwiCurrent: null, nbrCurrent: null,
  eviCurrent: null, bsiCurrent: null, fireDetected: false, floodDetected: false, landslideRisk: false,
  shadeScore: null, landscapeVariety: null, waterSources: [], phenologyPeakMonth: null, computedAt: null,
}

export async function fetchShadeWaterCache(osmRelationId: number): Promise<ShadeWaterCacheRow | null> {
  const { data } = await supabase
    .from('trails')
    .select('s2_shade_score, s2_water_sources, s2_computed_at, s2_available')
    .eq('osm_relation_id', osmRelationId)
    .maybeSingle()
  if (!data) return null
  return {
    shadeScore: data.s2_shade_score,
    waterSources: data.s2_water_sources ?? [],
    computedAt: data.s2_computed_at,
    available: data.s2_available ?? false,
  }
}

type PipelineResult =
  | { status: 'cached'; row: ShadeWaterCacheRow }
  | { status: 'computed'; row: ShadeWaterCacheRow }
  | { status: 'unavailable'; reason: UnavailableReason; debugInfo?: string }

async function runShadeWaterPipeline(trailPoints: [number, number][], cache: ShadeWaterCacheRow | null, force = false): Promise<PipelineResult> {
  if (trailPoints.length < 2) return { status: 'unavailable', reason: 'no_geometry' }

  const expired = force || !cache?.computedAt || Date.now() - new Date(cache.computedAt).getTime() > SERIES_TTL_MS
  if (!expired && cache) return { status: 'cached', row: cache }

  try {
    const bbox = computeBbox(trailPoints, 0.005)
    const { forestPolygons, waterCandidates } = await fetchOsmShadeWaterData(bbox)

    const shadeScore = computeForestCoverage(trailPoints, forestPolygons)
    const waterSources = computeWaterSources(trailPoints, waterCandidates)

    return {
      status: 'computed',
      row: { shadeScore, waterSources, computedAt: new Date().toISOString(), available: true },
    }
  } catch (err) {
    console.error('[shadeWater] Overpass pipeline failed', err)
    return { status: 'unavailable', reason: 'api_error', debugInfo: err instanceof Error ? err.message : String(err) }
  }
}

function rowToUpdatePayload(row: ShadeWaterCacheRow): Record<string, unknown> {
  return {
    // Ripuliti esplicitamente invece di lasciati intoccati: se una riga aveva dati satellitari
    // vecchi da prima di questo cambiamento, un ricalcolo li deve far sparire, non farli
    // sopravvivere accanto a un ombra/acqua ora calcolato diversamente.
    s2_ndvi_monthly: null, s2_ndvi_delta: null, s2_ndwi_current: null, s2_nbr_current: null,
    s2_evi_current: null, s2_bsi_current: null, s2_fire_detected: false, s2_flood_detected: false,
    s2_landslide_risk: false, s2_landscape_variety: null, s2_phenology_peak_month: null,
    s2_shade_score: row.shadeScore,
    s2_water_sources: row.waterSources,
    s2_computed_at: row.computedAt,
    s2_available: true,
  }
}

export async function computeShadeWater(osmRelationId: number, trailPoints: [number, number][], opts?: { force?: boolean }): Promise<Sentinel2Data> {
  const cache = await fetchShadeWaterCache(osmRelationId)
  const result = await runShadeWaterPipeline(trailPoints, cache, opts?.force)

  if (result.status === 'unavailable') {
    return { ...UNAVAILABLE, osmRelationId, reason: result.reason, debugInfo: result.debugInfo }
  }
  if (result.status === 'computed') {
    const { error } = await supabase.from('trails').update(rowToUpdatePayload(result.row)).eq('osm_relation_id', osmRelationId)
    if (error) console.error('[computeShadeWater] update trails failed', error)
  }
  return toShadeWaterData(result.row, { osmRelationId })
}

async function fetchShadeWaterCacheForPlannedHike(plannedHikeId: string): Promise<ShadeWaterCacheRow | null> {
  const { data } = await supabase
    .from('planned_hikes')
    .select('s2_shade_score, s2_water_sources, s2_computed_at, s2_available')
    .eq('id', plannedHikeId)
    .maybeSingle()
  if (!data) return null
  return {
    shadeScore: data.s2_shade_score,
    waterSources: data.s2_water_sources ?? [],
    computedAt: data.s2_computed_at,
    available: data.s2_available ?? false,
  }
}

// distanceKm/elevationGain/elevationLoss accettati solo per compatibilita di firma con la vecchia
// computeSentinel2ForPlannedHike (li leggeva app/api/trails/sentinel2/route.ts) — non servono più:
// l'ombra qui non dipende dalla pendenza, solo dalla copertura boschiva OSM lungo il tracciato.
export async function computeShadeWaterForPlannedHike(
  plannedHikeId: string,
  trailPoints: [number, number][],
  _distanceKm: number | null,
  _elevationGain: number | null,
  _elevationLoss: number | null,
  opts?: { force?: boolean },
): Promise<Sentinel2Data> {
  const cache = await fetchShadeWaterCacheForPlannedHike(plannedHikeId)
  const result = await runShadeWaterPipeline(trailPoints, cache, opts?.force)

  if (result.status === 'unavailable') {
    return { ...UNAVAILABLE, plannedHikeId, reason: result.reason, debugInfo: result.debugInfo }
  }
  if (result.status === 'computed') {
    const { error } = await supabase.from('planned_hikes').update(rowToUpdatePayload(result.row)).eq('id', plannedHikeId)
    if (error) console.error('[computeShadeWater] update planned_hikes failed', error)
  }
  return toShadeWaterData(result.row, { plannedHikeId })
}

export function toShadeWaterData(row: ShadeWaterCacheRow, ref: { osmRelationId?: number; plannedHikeId?: string }): Sentinel2Data {
  return {
    ...ref,
    available: row.available,
    ndviMonthly: null, ndviDelta: null, ndwiCurrent: null, nbrCurrent: null, eviCurrent: null, bsiCurrent: null,
    fireDetected: false, floodDetected: false, landslideRisk: false, landscapeVariety: null, phenologyPeakMonth: null,
    shadeScore: row.shadeScore,
    waterSources: row.waterSources,
    computedAt: row.computedAt,
  }
}
