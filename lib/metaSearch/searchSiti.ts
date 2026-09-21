import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineM } from '../geoUtils'
import { inferSiteTypeFromName, type SiteType } from '../metaTypes'
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
    // 391 Siti da MiC/ArCo condividono coordinate identiche con altri Siti scollegati (bug della
    // query SPARQL d'importazione, scripts/places/mic/fetch.ts — ?site non vincolato in certi
    // OPTIONAL si lega a una risorsa arbitraria invece di restare assente, individuato 2026-09-18
    // e marcato in dtrek_places.metadata.coordinatesUnreliable). Un pin in un punto sbagliato è
    // peggio di nessun pin (piano §48.8, mai un dato fabbricato/inaffidabile spacciato per buono)
    // — restano fuori dalla ricerca finché non c'è una posizione verificata, mai cancellati.
    // `.or()` invece di un filtro negato diretto: `metadata->>x != 'true'` in SQL scarterebbe anche
    // le righe senza quella chiave (confronto con NULL), che sono la stragrande maggioranza.
    .or('metadata->>coordinatesUnreliable.is.null,metadata->>coordinatesUnreliable.eq.false')

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

  // Bug reale (segnalato dal vivo 2026-09-21, "ho perso tantissimi siti"): 500 bastava quando il
  // catalogo Siti era più piccolo, ma senza un `order by` esplicito Postgres non garantisce QUALE
  // sottoinsieme di righe arriva prima del taglio — con il Lazio da solo a 1488 righe (dopo
  // un'importazione MiC massiva), righe note e ben piazzate uscivano dai risultati prima ancora di
  // essere valutate dal ranking sotto. Alzato il tetto e aggiunto un ordinamento esplicito per
  // confidenza, cosi anche in una regione più popolata di questo tetto le righe scartate sono le
  // meno affidabili, non un sottoinsieme arbitrario/instabile.
  const { data, error } = await query.order('confidence', { ascending: false }).limit(3000)
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
      // inferSiteTypeFromName: un subtype 'altro' spesso viene da un tag sorgente troppo generico
      // (es. OSM tourism=attraction) anche quando il nome dice chiaramente di cosa si tratta — vedi
      // lib/metaTypes.ts. Il filtro per categoria qui sopra (params.category) resta sul subtype
      // grezzo del DB: una Meta con subtype='altro' non compare cercando "musei" anche se il nome
      // lo è — correggere anche quello richiederebbe un filtro lato query, non solo di lettura.
      siteType: inferSiteTypeFromName(row.name, (row.subtype ?? undefined) as SiteType | undefined),
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
