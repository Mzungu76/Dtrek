import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineM } from '../geoUtils'
import type { CamminiSearchParams, CamminoStats, MetaSearchOrigin, MetaSearchResult, MetaSearchResultItem } from './types'

const DEFAULT_LIMIT = 30
const DEFAULT_MAX_DISTANCE_KM = 150

export interface CamminoRow {
  id: string
  name: string
  description: string | null
  latitude: number
  longitude: number
  region: string | null
  image_url: string | null
  confidence: number
  metadata: Record<string, unknown> | null
}

/** Distanza minima in km fra un punto e il tracciato (vertice più vicino della panoramica). */
export function polylineDistanceKm(polyline: [number, number][], origin: MetaSearchOrigin): number {
  let best = Infinity
  for (const [lat, lon] of polyline) {
    const d = haversineM(origin.lat, origin.lon, lat, lon)
    if (d < best) best = d
  }
  return best / 1000
}

export function camminoStatsFromMetadata(metadata: Record<string, unknown> | null): CamminoStats | null {
  if (!metadata || metadata.kind !== 'cammino') return null
  const poly = metadata.overviewPolyline
  if (!Array.isArray(poly) || poly.length < 2) return null
  const quality = (metadata.quality as { status?: string } | undefined)?.status === 'pronto' ? 'pronto' : 'da_rivedere'
  const source = metadata.tappeSource
  return {
    lengthM: typeof metadata.lengthM === 'number' ? metadata.lengthM : 0,
    tappeCount: typeof metadata.tappeCount === 'number' ? metadata.tappeCount : 0,
    tappeSource: source === 'official' || source === 'mixed' ? source : 'computed',
    structure: metadata.structure === 'rete' ? 'rete' : 'cammino',
    quality,
    overviewPolyline: poly as [number, number][],
  }
}

/**
 * Ranking dei cammini — logica pura, testata. Solo cammini "pronti" (salvo includeNotReady); con
 * un'origine, solo quelli il cui TRACCIATO passa entro maxDistanceKm (non il pin a metà strada:
 * un cammino lungo 300 km passa vicino a molti punti che il suo centro non è). Ordine: più vicino
 * prima; senza origine, più affidabile (tappe ufficiali) e più lungo prima.
 */
export function rankCammini(rows: CamminoRow[], params: CamminiSearchParams): MetaSearchResultItem[] {
  const maxKm = params.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM
  const items: MetaSearchResultItem[] = []
  for (const row of rows) {
    const stats = camminoStatsFromMetadata(row.metadata)
    if (!stats) continue
    if (stats.quality !== 'pronto' && !params.includeNotReady) continue
    const distanceKm = params.origin ? polylineDistanceKm(stats.overviewPolyline, params.origin) : undefined
    if (distanceKm != null && distanceKm > maxKm) continue
    const proximity = distanceKm == null ? 0 : Math.max(0, 1 - distanceKm / maxKm)
    const reliability = stats.tappeSource === 'official' ? 1 : stats.tappeSource === 'mixed' ? 0.7 : 0.4
    items.push({
      id: row.id,
      metaType: 'cammino',
      name: row.name,
      description: row.description ?? undefined,
      latitude: row.latitude,
      longitude: row.longitude,
      region: row.region ?? undefined,
      imageUrl: row.image_url ?? undefined,
      distanceKm,
      rankingScore: params.origin ? proximity * 0.8 + reliability * 0.2 : reliability,
      rankingBreakdown: { vicinanza: proximity, affidabilita_tappe: reliability },
      camminoStats: stats,
      hikeStats: { distanceMeters: stats.lengthM },
      sourceCount: 1,
      confidence: row.confidence,
    })
  }
  items.sort((a, b) => b.rankingScore - a.rankingScore || a.name.localeCompare(b.name))
  return items.slice(0, params.limit ?? DEFAULT_LIMIT)
}

export async function searchCammini(supabase: SupabaseClient, params: CamminiSearchParams): Promise<MetaSearchResult> {
  let query = supabase
    .from('dtrek_places')
    .select('id, name, description, latitude, longitude, region, image_url, confidence, metadata')
    .eq('meta_type', 'cammino')
  if (params.query) query = query.ilike('name', `%${params.query}%`)
  if (params.region) query = query.ilike('region', params.region)
  // Pochi cammini in tutto il catalogo (decine): niente pre-filtro geografico, il taglio per
  // distanza dal tracciato avviene in JS (rankCammini).
  const { data, error } = await query.limit(500)
  if (error) throw error
  const items = rankCammini((data ?? []) as CamminoRow[], params)
  return { metaType: 'cammino', items, total: items.length }
}
