// Supabase Edge Function — porta di scripts/places/mic/fetch.ts --source heritage (Catalogo
// Generale ICCD, classe ArCo arco:ArchitecturalOrLandscapeHeritage) in ambiente Deno, per poter
// eseguire l'import senza Termux/npm (che ha dato solo ETIMEDOUT sul registro npm dalla rete
// mobile) e senza aspettare la ripresa di GitHub Actions (sospese fino al 2026-10-01).
//
// Copre SOLO --source heritage, non 'cis'/'all': è la fonte che ha recuperato dal vivo la
// Basilica di Sant'Antonio a Padova (assente dal registro "Istituti e Luoghi della Cultura"),
// verificata con query manuali via Termux in questa sessione (2026-09-26) — vedi
// scripts/places/mic/README.md "Catalogo Generale ICCD" per la cronologia completa. A differenza
// del registro Istituti, questa fonte porta SEMPRE coordinate dirette quando la query la trova:
// nessuna geocodifica di ripiego (Nominatim) qui, quindi nessuna dipendenza da un secondo
// servizio esterno oltre a dati.cultura.gov.it.
//
// Il codice sotto è una copia intenzionale (non un import — Deno risolve moduli npm: via URL, ma
// scripts/places/* è codice Node non pubblicato come pacchetto) di:
//   - scripts/places/mic/fetch.ts: MIC_TYPE_MAP, micTypeLabelToSiteType, ARCHITECTURAL_HERITAGE_CLASS,
//     HeritageBinding, parseHeritageAddressLabel, heritageBindingToPlaceCandidate, buildHeritageQuery,
//     queryHeritageSparql, fetchSparqlJson (retry/backoff)
//   - scripts/places/normalize.ts: isPlausibleItalianCoordinate, normalizeForComparison,
//     nameTokenSimilarity, sameMunicipality
//   - scripts/places/deduplicate.ts: AUTO_MERGE_THRESHOLD, REVIEW_THRESHOLD, MAX_MATCH_DISTANCE_M,
//     distanceScore, scoreCandidateAgainstPlace, findBestMatch
//   - scripts/places/import.ts: ImportStats, mergeMetadata, findExistingBySourceId,
//     findNearbyExisting, linkSourceToPlace, candidateToPartialUpdate, refreshExistingPlace,
//     insertNewPlace, importPlaceCandidates
//   - lib/geoUtils.ts: haversineM
// Se la logica di dedup/import cambia in uno di questi file, va aggiornata anche qui a mano —
// nessun meccanismo automatico la tiene sincronizzata (limite noto, accettato per evitare di
// pubblicare scripts/places come pacchetto solo per questa funzione).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// ── types.ts (minimo, senza lib/metaTypes per non trascinare la dipendenza lucide-react — quel
// file è import type-only ovunque nel repo, quindi il suo corpo runtime non viene mai eseguito, ma
// qui comunque non serve: bastano i valori usati da questa sola fonte) ──────────────────────────
type MetaType = 'sito' | 'borgo_citta' | 'sentiero'
type SiteType =
  | 'sito_archeologico' | 'castello' | 'abbazia' | 'chiesa' | 'palazzo'
  | 'teatro' | 'museo' | 'monumento' | 'altro'
type PlaceSource = 'istat' | 'ptpr_lazio' | 'mic' | 'mic_iccd' | 'osm' | 'wikidata' | 'lombardia_sirbec'

interface FieldProvenance {
  value: unknown
  source: PlaceSource | string
  sourceUrl?: string
  retrievedAt: string
  sourceUpdatedAt?: string
  confidence: 'low' | 'medium' | 'high' | 'institutional'
  status?: 'ok' | 'stale' | 'missing' | 'conflict'
}

interface PlaceCandidate {
  name: string
  metaType: MetaType
  subtype?: SiteType | string
  description?: string
  latitude: number
  longitude: number
  geometry?: unknown
  region?: string
  province?: string
  municipality?: string
  municipalityIstatCode?: string
  address?: string
  imageUrl?: string
  officialUrl?: string
  website?: string
  phone?: string
  email?: string
  openingHours?: unknown
  source: PlaceSource
  sourceId: string
  sourceUrl?: string
  rawType?: string
  wikidataId?: string
  confidence: number
  metadata?: Record<string, unknown>
}

interface ExistingPlace {
  id: string
  name: string
  metaType: MetaType
  subtype?: string | null
  latitude: number
  longitude: number
  municipality?: string | null
  municipalityIstatCode?: string | null
  wikidataId?: string | null
  source?: PlaceSource | null
  sourceId?: string | null
  metadata?: Record<string, unknown> | null
}

// ── mic/fetch.ts (sezione heritage) ─────────────────────────────────────────────────────────────
const SPARQL_ENDPOINT = 'https://dati.cultura.gov.it/sparql'
const USER_AGENT = 'DTrek/1.0 (places catalog batch import; mzulpt@gmail.com)'

const MIC_TYPE_MAP: [string, SiteType][] = [
  ['area archeologic', 'sito_archeologico'], ['scavi', 'sito_archeologico'],
  ['necropoli', 'sito_archeologico'], ['parco archeologic', 'sito_archeologico'],
  ['castello', 'castello'], ['rocca', 'castello'], ['fortezza', 'castello'],
  ['fortificazione', 'castello'], ['forte', 'castello'],
  ['abbazia', 'abbazia'], ['monastero', 'abbazia'], ['convento', 'abbazia'], ['eremo', 'abbazia'],
  ['chiesa', 'chiesa'], ['basilica', 'chiesa'], ['cattedrale', 'chiesa'], ['santuario', 'chiesa'],
  ['duomo', 'chiesa'], ['battistero', 'chiesa'],
  ['palazzo', 'palazzo'], ['villa', 'palazzo'], ['dimora storica', 'palazzo'],
  ['teatro', 'teatro'], ['anfiteatro', 'teatro'],
  ['museo', 'museo'], ['pinacoteca', 'museo'], ['galleria', 'museo'], ['collezione', 'museo'],
  ['monumento', 'monumento'], ['mausoleo', 'monumento'], ['obelisco', 'monumento'],
]

function micTypeLabelToSiteType(label: string | undefined | null): SiteType {
  if (!label) return 'altro'
  const lower = label.toLowerCase()
  for (const [needle, type] of MIC_TYPE_MAP) if (lower.includes(needle)) return type
  return 'altro'
}

const ARCHITECTURAL_HERITAGE_CLASS = 'https://w3id.org/arco/ontology/arco/ArchitecturalOrLandscapeHeritage'
const CANDIDATE_POOL_CAP = 2000

interface HeritageBinding {
  id: string
  name: string
  dcType?: string
  addressLabel?: string
  fullAddress?: string
  depiction?: string
  lat: number
  long: number
}

function parseHeritageAddressLabel(label: string | undefined): { region?: string; municipality?: string } {
  if (!label) return {}
  const parts = label.split(',').map(p => p.trim())
  if (parts.length < 4) return {}
  return { region: parts[1] || undefined, municipality: parts[3] || undefined }
}

function heritageBindingToPlaceCandidate(b: HeritageBinding): PlaceCandidate {
  const { region, municipality } = parseHeritageAddressLabel(b.addressLabel)
  const sourceUrl = `https://catalogo.beniculturali.it/detail/ArchitecturalOrLandscapeHeritage/${b.id}`
  return {
    name: b.name,
    metaType: 'sito',
    subtype: micTypeLabelToSiteType(b.name),
    latitude: b.lat,
    longitude: b.long,
    region,
    municipality,
    address: b.fullAddress,
    imageUrl: b.depiction,
    source: 'mic_iccd',
    sourceId: b.id,
    sourceUrl,
    rawType: b.dcType,
    confidence: 0.75,
    metadata: { iccdDcType: b.dcType },
  }
}

function buildHeritageQuery(regionLabel?: string, limit = 5000): string {
  const candidatePool = Math.min(CANDIDATE_POOL_CAP, Math.max(limit * 4, 50))
  const regionFilter = regionLabel
    ? `FILTER(CONTAINS(?addressLabel, "${regionLabel.replace(/"/g, '')}"))`
    : ''

  return `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX clvapit: <https://w3id.org/italia/onto/CLV/>
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT DISTINCT ?heritage ?name ?dcType ?addressLabel ?fullAddress ?depiction ?lat ?long WHERE {
  {
    SELECT DISTINCT ?heritage ?name ?addressLabel ?lat ?long WHERE {
      ?heritage a <${ARCHITECTURAL_HERITAGE_CLASS}> ;
                rdfs:label ?name ;
                dcterms:spatial ?addr ;
                clvapit:hasGeometry ?geom .
      ?addr rdfs:label ?addressLabel .
      ?geom clvapit:hasGeometryType clvapit:Point .
      ?geom ?hasCoordPred ?coord .
      ?coord loc:lat ?lat ; loc:long ?long .
      ${regionFilter}
    }
    LIMIT ${candidatePool}
  }
  OPTIONAL { ?heritage dcterms:spatial ?addr2 . ?addr2 clvapit:fullAddress ?fullAddress . }
  OPTIONAL { ?heritage dc:type ?dcType . }
  OPTIONAL { ?heritage foaf:depiction ?depiction . }
}
LIMIT ${limit}`
}

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 4

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchSparqlJson(query: string): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1))

    let res: Response
    try {
      res = await fetch(SPARQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json',
          'User-Agent': USER_AGENT,
        },
        body: `query=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(60000),
      })
    } catch (e) {
      lastError = e
      continue
    }
    if (res.ok) return res.json()
    const bodyText = (await res.text()).slice(0, 500)
    if (!TRANSIENT_STATUS.has(res.status)) throw new Error(`MiC SPARQL ${res.status}: ${bodyText}`)
    lastError = new Error(`MiC SPARQL ${res.status}: ${bodyText}`)
  }
  throw lastError instanceof Error ? lastError : new Error('MiC SPARQL: troppi tentativi falliti')
}

async function queryHeritageSparql(query: string): Promise<HeritageBinding[]> {
  const data = await fetchSparqlJson(query) as { results: { bindings: Record<string, { value: string }>[] } }
  const seen = new Set<string>()
  const out: HeritageBinding[] = []
  for (const row of data.results.bindings) {
    const iri = row.heritage?.value
    if (!iri) continue
    const id = iri.split('/').pop()
    if (!id) continue
    const lat = row.lat ? parseFloat(row.lat.value) : NaN
    const long = row.long ? parseFloat(row.long.value) : NaN
    if (Number.isNaN(lat) || Number.isNaN(long)) continue
    const dedupKey = `${id}|${row.depiction?.value ?? ''}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    out.push({
      id,
      name: row.name?.value?.trim() || 'Bene architettonico o paesaggistico',
      dcType: row.dcType?.value,
      addressLabel: row.addressLabel?.value,
      fullAddress: row.fullAddress?.value,
      depiction: row.depiction?.value,
      lat,
      long,
    })
  }
  return out
}

// ── normalize.ts ─────────────────────────────────────────────────────────────────────────────────
const ITALY_BBOX = { minLat: 35, maxLat: 48, minLon: 6, maxLon: 19 }

function isPlausibleItalianCoordinate(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  return lat >= ITALY_BBOX.minLat && lat <= ITALY_BBOX.maxLat && lon >= ITALY_BBOX.minLon && lon <= ITALY_BBOX.maxLon
}

const COMBINING_DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g')

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(COMBINING_DIACRITICS_RE, '')
}

function normalizeForComparison(s: string): string {
  return stripDiacritics(s.trim().toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeForComparison(a).split(' ').filter(Boolean))
  const tokensB = new Set(normalizeForComparison(b).split(' ').filter(Boolean))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  for (const t of tokensA) if (tokensB.has(t)) intersection++
  const union = tokensA.size + tokensB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function sameMunicipality(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return normalizeForComparison(a) === normalizeForComparison(b)
}

// ── lib/geoUtils.ts ──────────────────────────────────────────────────────────────────────────────
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── deduplicate.ts ───────────────────────────────────────────────────────────────────────────────
const AUTO_MERGE_THRESHOLD = 0.9
const REVIEW_THRESHOLD = 0.6
const MAX_MATCH_DISTANCE_M = 2000

interface MatchResult {
  place: ExistingPlace
  confidence: number
  reasons: { factor: string; score: number; weight: number }[]
}

function distanceScore(distanceM: number): number {
  if (distanceM > MAX_MATCH_DISTANCE_M) return 0
  if (distanceM <= 30) return 1
  return 1 - (distanceM - 30) / (MAX_MATCH_DISTANCE_M - 30)
}

function scoreCandidateAgainstPlace(candidate: PlaceCandidate, existing: ExistingPlace): MatchResult {
  const reasons: MatchResult['reasons'] = []

  if (candidate.wikidataId && existing.wikidataId && candidate.wikidataId === existing.wikidataId) {
    return { place: existing, confidence: 1, reasons: [{ factor: 'wikidata_id', score: 1, weight: 1 }] }
  }

  if (candidate.metaType === 'borgo_citta' && existing.metaType === 'borgo_citta'
    && candidate.municipalityIstatCode && existing.municipalityIstatCode
    && candidate.municipalityIstatCode === existing.municipalityIstatCode) {
    return { place: existing, confidence: 1, reasons: [{ factor: 'municipality_istat_code', score: 1, weight: 1 }] }
  }

  const distM = haversineM(candidate.latitude, candidate.longitude, existing.latitude, existing.longitude)
  const distScore = distanceScore(distM)
  reasons.push({ factor: 'distance', score: distScore, weight: 0.5 })
  if (distScore === 0) return { place: existing, confidence: 0, reasons }

  const nameScore = nameTokenSimilarity(candidate.name, existing.name)
  reasons.push({ factor: 'name', score: nameScore, weight: 0.3 })

  const municipalityScore = sameMunicipality(candidate.municipality, existing.municipality) ? 1 : 0
  reasons.push({ factor: 'municipality', score: municipalityScore, weight: 0.1 })

  const typeScore = candidate.metaType === existing.metaType
    && (!candidate.subtype || !existing.subtype || candidate.subtype === existing.subtype)
    ? 1 : 0
  reasons.push({ factor: 'type', score: typeScore, weight: 0.1 })

  const confidence = reasons.reduce((sum, r) => sum + r.score * r.weight, 0)
  return { place: existing, confidence, reasons }
}

function findBestMatch(candidate: PlaceCandidate, nearbyExisting: ExistingPlace[]): MatchResult | null {
  let best: MatchResult | null = null
  for (const existing of nearbyExisting) {
    const result = scoreCandidateAgainstPlace(candidate, existing)
    if (!best || result.confidence > best.confidence) best = result
  }
  return best
}

// ── import.ts ────────────────────────────────────────────────────────────────────────────────────
const NEARBY_DEGREES = 0.03

interface ImportStats {
  processed: number
  linkedToExisting: number
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
    id: r.id as string,
    name: r.name as string,
    metaType: r.meta_type as ExistingPlace['metaType'],
    subtype: r.subtype as string | null,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    municipality: r.municipality as string | null,
    municipalityIstatCode: r.municipality_istat_code as string | null,
    wikidataId: r.wikidata_id as string | null,
    source: r.source as ExistingPlace['source'],
    sourceId: r.source_id as string | null,
    metadata: r.metadata as Record<string, unknown> | null,
  }
}

function mergeMetadata(
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
    place_id: placeId,
    source: candidate.source,
    source_id: candidate.sourceId,
    source_url: candidate.sourceUrl ?? null,
    raw_type: candidate.rawType ?? null,
    confidence: candidate.confidence,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'source,source_id' })
  if (error) throw error
}

function candidateToPartialUpdate(
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
  if (candidate.metadata !== undefined) updates.metadata = mergeMetadata(existingMetadata, candidate.metadata)
  return updates
}

async function refreshExistingPlace(supabase: SupabaseClient, placeId: string, candidate: PlaceCandidate, existingMetadata: Record<string, unknown> | null | undefined) {
  const { error } = await supabase.from('dtrek_places').update(candidateToPartialUpdate(candidate, existingMetadata)).eq('id', placeId)
  if (error) throw error
}

async function insertNewPlace(supabase: SupabaseClient, candidate: PlaceCandidate, review: { confidence: number; matchedPlaceId: string } | null) {
  const { data: existingBySourceId } = await supabase
    .from('dtrek_places')
    .select('metadata')
    .eq('source', candidate.source)
    .eq('source_id', candidate.sourceId)
    .maybeSingle()

  const metadata = mergeMetadata(existingBySourceId?.metadata as Record<string, unknown> | null | undefined, candidate.metadata)
  if (review) {
    metadata.needsReview = true
    metadata.reviewCandidateOf = review.matchedPlaceId
    metadata.reviewConfidence = review.confidence
  }

  const { data, error } = await supabase.from('dtrek_places').upsert({
    name: candidate.name,
    meta_type: candidate.metaType,
    subtype: candidate.subtype ?? null,
    description: candidate.description ?? null,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    region: candidate.region ?? null,
    province: candidate.province ?? null,
    municipality: candidate.municipality ?? null,
    municipality_istat_code: candidate.municipalityIstatCode ?? null,
    address: candidate.address ?? null,
    image_url: candidate.imageUrl ?? null,
    official_url: candidate.officialUrl ?? null,
    website: candidate.website ?? null,
    phone: candidate.phone ?? null,
    email: candidate.email ?? null,
    opening_hours: candidate.openingHours ?? null,
    source: candidate.source,
    source_id: candidate.sourceId,
    confidence: candidate.confidence,
    wikidata_id: candidate.wikidataId ?? null,
    metadata,
  }, { onConflict: 'source,source_id' })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

async function importPlaceCandidates(supabase: SupabaseClient, candidates: PlaceCandidate[]): Promise<ImportStats> {
  const stats = emptyStats()

  for (const candidate of candidates) {
    stats.processed++

    if (!isPlausibleItalianCoordinate(candidate.latitude, candidate.longitude)) {
      stats.skippedInvalidCoordinates++
      continue
    }

    try {
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

// ── HTTP handler ─────────────────────────────────────────────────────────────────────────────────
// Body JSON: { region?: string, limit?: number, dryRun?: boolean }
// - dryRun default true (sicurezza: una chiamata senza corpo o con corpo vuoto non scrive mai).
// - region: stessa capitalizzazione richiesta dalla query ArCo (es. "Veneto", non "veneto") — senza,
//   interroga senza filtro regione (più lento, valido su scala nazionale entro `limit`).
// - limit: default 20 per il primo test, come da convenzione del workflow GitHub equivalente.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Usa POST con un body JSON { region?, limit?, dryRun? }' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { region?: string; limit?: number; dryRun?: boolean } = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return new Response(JSON.stringify({ error: 'Body JSON non valido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const region = body.region
  const limit = Number.isFinite(body.limit) ? Number(body.limit) : 20
  const dryRun = body.dryRun !== false // default true

  try {
    const heritageBindings = await queryHeritageSparql(buildHeritageQuery(region, limit))
    const candidates = heritageBindings.map(heritageBindingToPlaceCandidate)

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        region: region ?? 'tutta Italia (nessun filtro)',
        limit,
        totalCandidates: candidates.length,
        sampleCandidate: candidates[0] ?? null,
      }, null, 2), { headers: { 'Content-Type': 'application/json' } })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return new Response(JSON.stringify({ error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY mancanti (dovrebbero essere auto-iniettate da Supabase)' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const stats = await importPlaceCandidates(supabase, candidates)

    return new Response(JSON.stringify({
      dryRun: false,
      region: region ?? 'tutta Italia (nessun filtro)',
      limit,
      totalCandidates: candidates.length,
      stats,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
