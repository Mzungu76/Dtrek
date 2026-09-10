import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineM } from '../geoUtils'
import type { BorghiSearchParams, MetaSearchResult, MetaSearchResultItem } from './types'
import {
  combineFactors, dataQualityFactor, distanceFactor, historicalCenterFactor,
  inferredInterestTags, interestMatchFactor, ptprBorgoIdentitarioFactor,
} from './ranking'
import { countPopulatedFields, fetchSourceCounts, originBbox } from './placeQuery'

const DEFAULT_LIMIT = 30
const DEFAULT_MAX_DISTANCE_KM = 100
// Campi "opzionali" usati per il fattore di completezza di dataQualityFactor — solo quelli che una
// fonte come ISTAT/PTPR potrebbe realisticamente valorizzare per un borgo_citta (piano §22
// "qualità dati"), non l'intero schema di dtrek_places.
const OPTIONAL_FIELDS = ['description', 'image_url', 'official_url', 'website', 'address'] as const

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
  source: string
  confidence: number
  metadata: Record<string, unknown> | null
}

// Query + ranking deterministico (piano §19/§22) su dtrek_places — MAI un LLM a decidere quali
// Mete esistono (piano §21): questa funzione è l'unico punto che tocca il database per i Borghi/
// Città, searchMeta() la chiama e basta.
export async function searchBorghi(supabase: SupabaseClient, params: BorghiSearchParams): Promise<MetaSearchResult> {
  const maxDistanceKm = params.maxDistanceKm ?? DEFAULT_MAX_DISTANCE_KM
  const limit = params.limit ?? DEFAULT_LIMIT

  let query = supabase
    .from('dtrek_places')
    .select('id, name, subtype, description, latitude, longitude, region, province, municipality, image_url, official_url, website, address, source, confidence, metadata')
    .eq('meta_type', 'borgo_citta')

  if (params.query) query = query.ilike('name', `%${params.query}%`)
  if (params.region) query = query.ilike('region', params.region)
  if (params.province) query = query.ilike('province', params.province)
  if (params.category && params.category.length > 0) query = query.in('subtype', params.category)

  // Pre-filtro geografico grossolano in SQL (stesso spirito di NEARBY_DEGREES in
  // scripts/places/import.ts) — evita di scaricare l'intero catalogo nazionale quando la ricerca
  // ha già un'origine, il ranking fine per distanza resta comunque in JS (distanceFactor).
  if (params.origin) {
    const bbox = originBbox(params.origin, maxDistanceKm)
    query = query
      .gte('latitude', bbox.minLat).lte('latitude', bbox.maxLat)
      .gte('longitude', bbox.minLon).lte('longitude', bbox.maxLon)
  }

  const { data, error } = await query.limit(500) // tetto largo pre-ranking, non il limit finale richiesto dall'utente
  if (error) throw error
  const rows = (data ?? []) as PlaceRow[]

  const sourceCounts = await fetchSourceCounts(supabase, rows.map(r => r.id))

  const scored = rows.map((row): MetaSearchResultItem => {
    const populatedCount = countPopulatedFields(row as unknown as Record<string, unknown>, OPTIONAL_FIELDS)
    const available = inferredInterestTags(row.metadata)
    const { score, breakdown } = combineFactors([
      historicalCenterFactor(row.metadata),
      ptprBorgoIdentitarioFactor(row.metadata),
      distanceFactor(params.origin, row.latitude, row.longitude, maxDistanceKm),
      dataQualityFactor(sourceCounts.get(row.id) ?? 1, row.confidence, populatedCount, OPTIONAL_FIELDS.length),
      interestMatchFactor(params.interests, available),
    ])

    return {
      id: row.id,
      metaType: 'borgo_citta',
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

  // Se è stata data un'origine con un raggio massimo, scarta chi è oltre — il pre-filtro SQL sopra
  // è solo un bbox approssimativo (usa un grado costante per km, impreciso in latitudine), questo
  // taglio finale usa la distanza reale già calcolata in distanceKm.
  const filtered = params.origin
    ? scored.filter(item => (item.distanceKm ?? Infinity) <= maxDistanceKm)
    : scored

  filtered.sort((a, b) => b.rankingScore - a.rankingScore)
  const items = filtered.slice(0, limit)

  return { metaType: 'borgo_citta', items, total: filtered.length }
}
