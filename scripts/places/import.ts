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
  // Sottoinsieme di linkedToExisting: quante di quelle righe esistenti sono state anche
  // aggiornate con i valori freschi del candidato (stesso source+sourceId della riga — vedi
  // refreshExistingPlace) invece di un semplice ri-collegamento senza modifiche.
  refreshedExisting: number
  createdNew: number
  flaggedForReview: number
  skippedInvalidCoordinates: number
  errors: { candidate: PlaceCandidate; message: string }[]
}

function emptyStats(): ImportStats {
  return { processed: 0, linkedToExisting: 0, refreshedExisting: 0, createdNew: 0, flaggedForReview: 0, skippedInvalidCoordinates: 0, errors: [] }
}

const EXISTING_PLACE_COLS = 'id, name, meta_type, subtype, latitude, longitude, municipality, municipality_istat_code, wikidata_id, source, source_id, metadata'

function rowToExistingPlace(r: Record<string, unknown>): ExistingPlace {
  return {
    id:                    r.id as string,
    name:                  r.name as string,
    metaType:              r.meta_type as ExistingPlace['metaType'],
    subtype:               r.subtype as string | null,
    latitude:              r.latitude as number,
    longitude:             r.longitude as number,
    municipality:          r.municipality as string | null,
    municipalityIstatCode: r.municipality_istat_code as string | null,
    wikidataId:            r.wikidata_id as string | null,
    source:                r.source as ExistingPlace['source'],
    sourceId:              r.source_id as string | null,
    metadata:              r.metadata as Record<string, unknown> | null,
  }
}

// Fonde il `metadata` di un candidato in arrivo con quello già scritto sulla riga (MIC_DATA_SOURCES.md
// §9/§10) — MAI un overwrite completo: un ri-fetch che aggiorna solo alcuni campi arricchenti (es.
// solo le coordinate, non la descrizione) non deve cancellare la provenienza già registrata per gli
// altri. `fieldProvenance` è fuso chiave per chiave (una entry per campo), non come blob unico — lo
// stesso principio già applicato riga per riga in `candidateToPartialUpdate` sotto. Pura, testabile
// senza rete.
export function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = { ...(existing ?? {}) }
  if (!incoming) return base
  const merged = { ...base, ...incoming }
  const existingProvenance = (base.fieldProvenance ?? {}) as Record<string, unknown>
  const incomingProvenance = (incoming.fieldProvenance ?? {}) as Record<string, unknown>
  if (Object.keys(existingProvenance).length > 0 || Object.keys(incomingProvenance).length > 0) {
    merged.fieldProvenance = { ...existingProvenance, ...incomingProvenance }
  }
  return merged
}

// Ricerca ESATTA e univoca su (source, source_id) — mai ambigua, a differenza di
// findNearbyExisting sotto (prossimità geografica + punteggio nome). Bug reale trovato dal vivo
// (2026-09-21, segnalazione utente "ho perso tantissimi siti"): quando molte righe condividono per
// errore la stessa coordinata (flag `coordinatesUnreliable`, impostato a mano il 2026-09-18 su 391
// Siti MiC), la ricerca "vicino" può non riconoscere come "la stessa entità" un candidato che in
// realtà è un semplice ri-fetch di una riga già importata — quel candidato finiva quindi in
// insertNewPlace, che tramite l'UNIQUE(source, source_id) del database colpiva comunque la riga
// originale ma con un upsert che SOVRASCRIVEVA la sua metadata alla cieca (cancellando
// coordinatesUnreliable) e la marcava pure `needsReview` nonostante fosse la stessa Meta di sempre.
// Controllare PRIMA questa identità univoca — se il candidato è un ri-fetch della stessa fonte+ID,
// è la stessa entità per definizione, indipendentemente da coordinate/nome — evita del tutto
// l'ambiguità della ricerca per prossimità in questo caso.
async function findExistingBySourceId(supabase: SupabaseClient, candidate: PlaceCandidate): Promise<ExistingPlace | null> {
  const { data, error } = await supabase
    .from('dtrek_places')
    .select(EXISTING_PLACE_COLS)
    .eq('source', candidate.source)
    .eq('source_id', candidate.sourceId)
    .maybeSingle()
  if (error) throw error
  return data ? rowToExistingPlace(data) : null
}

async function findNearbyExisting(supabase: SupabaseClient, candidate: PlaceCandidate): Promise<ExistingPlace[]> {
  const { data, error } = await supabase
    .from('dtrek_places')
    .select(EXISTING_PLACE_COLS)
    .eq('meta_type', candidate.metaType)
    .gte('latitude', candidate.latitude - NEARBY_DEGREES)
    .lte('latitude', candidate.latitude + NEARBY_DEGREES)
    .gte('longitude', candidate.longitude - NEARBY_DEGREES)
    .lte('longitude', candidate.longitude + NEARBY_DEGREES)

  if (error) throw error
  const results = (data ?? []).map(rowToExistingPlace)

  // Un Comune grande/irregolare può avere un centroide di poligono a diversi km dal punto che
  // un'altra fonte userebbe per lo stesso Comune (verificato su dati reali: Latina, Sabaudia,
  // Pontinia — oltre il raggio NEARBY_DEGREES) — il corto-circuito su municipality_istat_code in
  // deduplicate.ts serve a niente se la riga non arriva mai fin qui. Query aggiuntiva, indipendente
  // dalla distanza, solo quando ha senso (due 'borgo_citta' con lo stesso codice Comune).
  if (candidate.metaType === 'borgo_citta' && candidate.municipalityIstatCode) {
    const { data: byCode, error: codeError } = await supabase
      .from('dtrek_places')
      .select(EXISTING_PLACE_COLS)
      .eq('meta_type', 'borgo_citta')
      .eq('municipality_istat_code', candidate.municipalityIstatCode)
    if (codeError) throw codeError
    for (const row of (byCode ?? []).map(rowToExistingPlace)) {
      if (!results.some(r => r.id === row.id)) results.push(row)
    }
  }

  return results
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

// Ri-fetch della STESSA fonte per la STESSA entità (source+sourceId identici alla riga già in
// dtrek_places, non un match incrociato con un'altra fonte) — aggiorna i campi che quella fonte
// fornisce davvero, mai gli altri: un ri-fetch ISTAT non deve azzerare wikidata_id/image_url
// popolati da un passaggio di arricchimento successivo (wikidata/enrich.ts, mic/fetch.ts...) che
// questo candidato non conosce affatto (`undefined`, non `null` — la differenza conta qui). Prima
// di questa funzione, il collegamento a un match ≥AUTO_MERGE_THRESHOLD (vedi importPlaceCandidates
// sotto) non toccava MAI latitude/longitude di una riga già esistente — bug reale osservato in
// produzione: un fix del centroide ISTAT (scripts/places/istat/fetch.ts) non aveva alcun effetto
// per un Comune già importato in precedenza, perché questo ramo si fermava a ri-collegare la
// fonte senza mai riscrivere le coordinate.
// `existingMetadata` è la riga della Meta così com'è OGGI (ExistingPlace.metadata) — assente per i
// chiamanti che non ce l'hanno (es. i test diretti su un candidato isolato, dove non fondere con
// nulla è corretto). Esportata per il test diretto (pura, nessun I/O) — vedi
// scripts/places/__tests__/import.test.ts.
export function candidateToPartialUpdate(
  candidate: PlaceCandidate,
  existingMetadata?: Record<string, unknown> | null,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    name: candidate.name,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    confidence: candidate.confidence,
  }
  if (candidate.subtype !== undefined) updates.subtype = candidate.subtype
  if (candidate.description !== undefined) updates.description = candidate.description
  if (candidate.region !== undefined) updates.region = candidate.region
  if (candidate.province !== undefined) updates.province = candidate.province
  if (candidate.municipality !== undefined) updates.municipality = candidate.municipality
  if (candidate.municipalityIstatCode !== undefined) updates.municipality_istat_code = candidate.municipalityIstatCode
  if (candidate.address !== undefined) updates.address = candidate.address
  if (candidate.imageUrl !== undefined) updates.image_url = candidate.imageUrl
  if (candidate.officialUrl !== undefined) updates.official_url = candidate.officialUrl
  if (candidate.website !== undefined) updates.website = candidate.website
  if (candidate.phone !== undefined) updates.phone = candidate.phone
  if (candidate.email !== undefined) updates.email = candidate.email
  if (candidate.openingHours !== undefined) updates.opening_hours = candidate.openingHours
  if (candidate.wikidataId !== undefined) updates.wikidata_id = candidate.wikidataId
  // Prima di questo cambio, un ri-fetch della stessa fonte non toccava MAI `metadata` — la
  // provenienza per campo (fieldProvenance) scritta al primo insert restava congelata per sempre,
  // `retrievedAt` incluso, anche quando la fonte veniva rinterrogata mesi dopo. Fusa con quella
  // esistente (mergeMetadata), mai un overwrite completo — vedi la funzione sopra.
  if (candidate.metadata !== undefined) updates.metadata = mergeMetadata(existingMetadata, candidate.metadata)
  return updates
}

async function refreshExistingPlace(supabase: SupabaseClient, placeId: string, candidate: PlaceCandidate, existingMetadata: Record<string, unknown> | null | undefined) {
  const { error } = await supabase.from('dtrek_places').update(candidateToPartialUpdate(candidate, existingMetadata)).eq('id', placeId)
  if (error) throw error
}

async function insertNewPlace(supabase: SupabaseClient, candidate: PlaceCandidate, review: { confidence: number; matchedPlaceId: string } | null) {
  // Bug reale (segnalato dal vivo 2026-09-21): l'upsert sotto usa `onConflict: 'source,source_id'`
  // — se una riga con QUESTA identica coppia esiste già ma `findNearbyExisting`/`findBestMatch` non
  // l'ha riconosciuta come "vicina" (capita spesso quando più Siti condividono per errore la stessa
  // coordinata, vedi il flag `coordinatesUnreliable` impostato manualmente su 391 Siti MiC il
  // 2026-09-18), il vincolo del database colpisce comunque quella riga — e un upsert con
  // `metadata: {...(candidate.metadata ?? {})}` la SOVRASCRIVE alla cieca, cancellando
  // silenziosamente qualunque flag curato a mano che il candidato fresco non conosce affatto.
  // Query diretta e ​univoca (non la ricerca "vicino" di findNearbyExisting) per fondere sempre con
  // quanto già presente, mai un overwrite completo — stesso principio già applicato in
  // refreshExistingPlace/mergeMetadata sopra.
  const { data: existingBySourceId } = await supabase
    .from('dtrek_places')
    .select('metadata')
    .eq('source', candidate.source)
    .eq('source_id', candidate.sourceId)
    .maybeSingle()

  const metadata = mergeMetadata(existingBySourceId?.metadata as Record<string, unknown> | null | undefined, candidate.metadata)
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
    phone:                    candidate.phone ?? null,
    email:                    candidate.email ?? null,
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
// Idempotente: ri-eseguire con lo stesso input aggiorna last_synced_at (e i campi che quella fonte
// possiede — vedi refreshExistingPlace/candidateToPartialUpdate sopra) invece di duplicare righe,
// grazie ai vincoli UNIQUE(source, source_id) su entrambe le tabelle. Un match ≥AUTO_MERGE_THRESHOLD
// con una fonte DIVERSA da quella già collegata (es. `mic` che incrocia una riga nata da `istat`)
// resta invece un semplice ri-collegamento senza scrittura — mai sovrascrivere il dato di una fonte
// con quello di un'altra solo perché sono state giudicate "lo stesso posto".
export async function importPlaceCandidates(supabase: SupabaseClient, candidates: PlaceCandidate[]): Promise<ImportStats> {
  const stats = emptyStats()

  for (const candidate of candidates) {
    stats.processed++

    if (!isPlausibleItalianCoordinate(candidate.latitude, candidate.longitude)) {
      stats.skippedInvalidCoordinates++
      continue
    }

    try {
      // Identità esatta PRIMA della ricerca fuzzy per prossimità — vedi il commento su
      // findExistingBySourceId sopra. Un ri-fetch della stessa fonte+ID è sempre la stessa entità,
      // mai un nuovo candidato "trovato per caso vicino", qualunque cosa dicano le coordinate.
      const exact = await findExistingBySourceId(supabase, candidate)
      if (exact) {
        await refreshExistingPlace(supabase, exact.id, candidate, exact.metadata)
        await linkSourceToPlace(supabase, exact.id, candidate)
        stats.refreshedExisting++
        stats.linkedToExisting++
        continue
      }

      const nearby = await findNearbyExisting(supabase, candidate)
      const match = findBestMatch(candidate, nearby)

      if (match && match.confidence >= AUTO_MERGE_THRESHOLD) {
        if (match.place.source === candidate.source && match.place.sourceId === candidate.sourceId) {
          await refreshExistingPlace(supabase, match.place.id, candidate, match.place.metadata)
          stats.refreshedExisting++
        }
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
