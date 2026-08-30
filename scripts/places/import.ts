import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExistingPlace, PlaceCandidate } from './types'
import { findBestMatch, AUTO_MERGE_THRESHOLD, REVIEW_THRESHOLD } from './deduplicate'
import { isPlausibleItalianCoordinate } from './normalize'

// Importer generico (piano §41, scripts/places/import.ts) — prende candidati già normalizzati nel
// modello comune (types.ts) da QUALUNQUE fetcher di sorgente e li scrive in dtrek_places/
// dtrek_place_sources applicando l'entity matching di deduplicate.ts. Nessun fetcher chiama
// Supabase direttamente: passa sempre da qui, così la logica di dedup/scrittura è unica (piano
// §48.3, "non creare tre copie dei componenti").
//
// Il chiamante (un supabase-js client service-role — bypassa la RLS, stesso pattern di
// scripts/import-ptpr.ts) resta iniettato come parametro invece che istanziato qui dentro, per
// poter testare la logica di orchestrazione con un client finto senza una connessione reale
// (nessuna infrastruttura di mock Supabase in questo repo oggi — vedi lib/closureSummary; questo
// modulo comunque non ha test perché è puro I/O, la logica pura è in deduplicate.ts/normalize.ts,
// già testate).

// Raggio della query di prossimità prima del matching — abbastanza largo da coprire
// MAX_MATCH_DISTANCE_M di deduplicate.ts con margine per l'approssimazione lat/lon→metri.
const NEARBY_DEGREES = 0.03 // ~3km a queste latitudini

export interface ImportStats {
  processed: number
  linkedToExisting: number
  createdNew: number
  flaggedForReview: number
  skippedInvalidCoordinates: number
  errors: { candidate: PlaceCandidate; message: string }[]
}

function emptyStats(): ImportStats {
  return { processed: 0, linkedToExisting: 0, createdNew: 0, flaggedForReview: 0, skippedInvalidCoordinates: 0, errors: [] }
}

async function findNearbyExisting(supabase: SupabaseClient, candidate: PlaceCandidate): Promise<ExistingPlace[]> {
  const { data, error } = await supabase
    .from('dtrek_places')
    .select('id, name, meta_type, subtype, latitude, longitude, municipality, wikidata_id')
    .eq('meta_type', candidate.metaType)
    .gte('latitude', candidate.latitude - NEARBY_DEGREES)
    .lte('latitude', candidate.latitude + NEARBY_DEGREES)
    .gte('longitude', candidate.longitude - NEARBY_DEGREES)
    .lte('longitude', candidate.longitude + NEARBY_DEGREES)

  if (error) throw error
  return (data ?? []).map((r): ExistingPlace => ({
    id:           r.id as string,
    name:         r.name as string,
    metaType:     r.meta_type as ExistingPlace['metaType'],
    subtype:      r.subtype as string | null,
    latitude:     r.latitude as number,
    longitude:    r.longitude as number,
    municipality: r.municipality as string | null,
    wikidataId:   r.wikidata_id as string | null,
  }))
}

async function linkSourceToPlace(supabase: SupabaseClient, placeId: string, candidate: PlaceCandidate) {
  const { error } = await supabase.from('dtrek_place_sources').upsert({
    place_id:       placeId,
    source:         candidate.source,
    source_id:      candidate.sourceId,
    source_url:     candidate.sourceUrl ?? null,
    raw_type:       candidate.rawType ?? null,
    confidence:     candidate.confidence,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'source,source_id' })
  if (error) throw error
}

async function insertNewPlace(supabase: SupabaseClient, candidate: PlaceCandidate, review: { confidence: number; matchedPlaceId: string } | null) {
  const metadata = { ...(candidate.metadata ?? {}) } as Record<string, unknown>
  if (review) {
    // Match probabile (piano §14) — MAI fuso automaticamente, ma segnalato per verifica manuale
    // invece di sparire silenziosamente come duplicato indistinguibile.
    metadata.needsReview = true
    metadata.reviewCandidateOf = review.matchedPlaceId
    metadata.reviewConfidence = review.confidence
  }

  const { data, error } = await supabase.from('dtrek_places').upsert({
    name:                     candidate.name,
    meta_type:                candidate.metaType,
    subtype:                  candidate.subtype ?? null,
    description:              candidate.description ?? null,
    latitude:                 candidate.latitude,
    longitude:                candidate.longitude,
    region:                   candidate.region ?? null,
    province:                 candidate.province ?? null,
    municipality:             candidate.municipality ?? null,
    municipality_istat_code:  candidate.municipalityIstatCode ?? null,
    address:                  candidate.address ?? null,
    image_url:                candidate.imageUrl ?? null,
    official_url:             candidate.officialUrl ?? null,
    website:                  candidate.website ?? null,
    opening_hours:            candidate.openingHours ?? null,
    source:                   candidate.source,
    source_id:                candidate.sourceId,
    confidence:               candidate.confidence,
    wikidata_id:              candidate.wikidataId ?? null,
    metadata,
  }, { onConflict: 'source,source_id' })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

// Importa un lotto di candidati (tipicamente tutti dalla stessa fonte/esecuzione di un fetcher).
// Idempotente: ri-eseguire con lo stesso input aggiorna last_synced_at invece di duplicare righe,
// grazie ai vincoli UNIQUE(source, source_id) su entrambe le tabelle.
export async function importPlaceCandidates(supabase: SupabaseClient, candidates: PlaceCandidate[]): Promise<ImportStats> {
  const stats = emptyStats()

  for (const candidate of candidates) {
    stats.processed++

    if (!isPlausibleItalianCoordinate(candidate.latitude, candidate.longitude)) {
      stats.skippedInvalidCoordinates++
      continue
    }

    try {
      const nearby = await findNearbyExisting(supabase, candidate)
      const match = findBestMatch(candidate, nearby)

      if (match && match.confidence >= AUTO_MERGE_THRESHOLD) {
        await linkSourceToPlace(supabase, match.place.id, candidate)
        stats.linkedToExisting++
        continue
      }

      const review = match && match.confidence >= REVIEW_THRESHOLD
        ? { confidence: match.confidence, matchedPlaceId: match.place.id }
        : null
      const placeId = await insertNewPlace(supabase, candidate, review)
      await linkSourceToPlace(supabase, placeId, candidate)
      stats.createdNew++
      if (review) stats.flaggedForReview++
    } catch (e) {
      stats.errors.push({ candidate, message: e instanceof Error ? e.message : String(e) })
    }
  }

  return stats
}
