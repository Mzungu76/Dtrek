import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineM } from '../geoUtils'
import type { SiteType } from '../metaTypes'
import type { SitiSearchParams, MetaSearchResult, MetaSearchResultItem } from './types'
import { combineFactors, dataQualityFactor, distanceFactor, inferredInterestTags, interestMatchFactor } from './ranking'
import { countPopulatedFields, fetchSourceCounts, originBbox } from './placeQuery'

const DEFAULT_LIMIT = 30
const DEFAULT_MAX_DISTANCE_KM = 50
const OPTIONAL_FIELDS = ['description', 'image_url', 'official_url', 'website', 'address', 'opening_hours'] as const

interface PlaceRow {
  id: string
  name: string
  subtype: string | null
  description: string | null
  latitude: number
  longitude: number
  region: string | null
  province: string | null
  municipality: string | null
  image_url: string | null
  official_url: string | null
  website: string | null
  address: string | null
  opening_hours: unknown
  source: string
  confidence: number
  metadata: Record<string, unknown> | null
}

// Query + ranking deterministico (piano §20/§23) su dtrek_places, meta_type='sito'. Il "sistema
// seleziona le fonti pertinenti" del piano §20 (es. "Castelli → MiC + OSM + Regione") è già
// avvenuto A MONTE, al momento dell'import (ogni riga porta il proprio `source`) — questa funzione
// si limita a filtrare/ordinare il catalogo già popolato, mai a decidere quali fonti interrogare
// per una ricerca (piano §21, niente query live per-utente).
export async function searchSiti(supabase: SupabaseClient, params: SitiSearchParams): Promise<MetaSearchResult> {
  const maxDistanceKm = params.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM
  const limit = params.limit ?? DEFAULT_LIMIT

  let query = supabase
    .from('dtrek_places')
    .select('id, name, subtype, description, latitude, longitude, region, province, municipality, image_url, official_url, website, address, opening_hours, source, confidence, metadata')
    .eq('meta_type', 'sito')

  if (params.query) query = query.ilike('name', `%${params.query}%`)
  if (params.region) query = query.ilike('region', params.region)
  if (params.province) query = query.ilike('province', params.province)
  // Match categoria (piano §23) — applicato come filtro qui, non come fattore di punteggio: ogni
  // riga restituita rispetta già la categoria richiesta, uno score separato sarebbe sempre 1.0.
  if (params.category && params.category.length > 0) query = query.in('subtype', params.category as SiteType[])

  if (params.origin) {
    const bbox = originBbox(params.origin, maxDistanceKm)
    query = query
      .gte('latitude', bbox.minLat).lte('latitude', bbox.maxLat)
      .gte('longitude', bbox.minLon).lte('longitude', bbox.maxLon)
  }

  const { data, error } = await query.limit(500)
  if (error) throw error
  const rows = (data ?? []) as PlaceRow[]

  const sourceCounts = await fetchSourceCounts(supabase, rows.map(r => r.id))

  const scored = rows.map((row): MetaSearchResultItem => {
    const populatedCount = countPopulatedFields(row as unknown as Record<string, unknown>, OPTIONAL_FIELDS)
    const available = inferredInterestTags(row.metadata)
    const { score, breakdown } = combineFactors([
      distanceFactor(params.origin, row.latitude, row.longitude, maxDistanceKm),
      dataQualityFactor(sourceCounts.get(row.id) ?? 1, row.confidence, populatedCount, OPTIONAL_FIELDS.length),
      interestMatchFactor(params.interests, available),
    ])

    return {
      id: row.id,
      metaType: 'sito',
      siteType: (row.subtype ?? undefined) as SiteType | undefined,
      name: row.name,
      description: row.description ?? undefined,
      latitude: row.latitude,
      longitude: row.longitude,
      region: row.region ?? undefined,
      province: row.province ?? undefined,
      municipality: row.municipality ?? undefined,
      imageUrl: row.image_url ?? undefined,
      distanceKm: params.origin ? haversineM(params.origin.lat, params.origin.lon, row.latitude, row.longitude) / 1000 : undefined,
      rankingScore: score,
      rankingBreakdown: breakdown,
      sourceCount: sourceCounts.get(row.id) ?? 1,
      confidence: row.confidence,
    }
  })

  const filtered = params.origin
    ? scored.filter(item => (item.distanceKm ?? Infinity) <= maxDistanceKm)
    : scored

  filtered.sort((a, b) => b.rankingScore - a.rankingScore)
  const items = filtered.slice(0, limit)

  return { metaType: 'sito', items, total: filtered.length }
}
