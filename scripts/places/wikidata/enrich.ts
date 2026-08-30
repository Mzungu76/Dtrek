/**
 * Wikidata → arricchimento di dtrek_places con wikidata_id (piano §11 — NON una fonte primaria)
 *
 * Diversamente dagli altri fetcher in scripts/places/*, questo script NON produce
 * PlaceCandidate[] né chiama importPlaceCandidates(): opera SOLO in UPDATE su righe già esistenti
 * in dtrek_places (create da ISTAT/PTPR/MiC/OSM), mai un INSERT — "Wikidata NON è fonte primaria
 * dell'anagrafe... NON rendere Wikidata obbligatorio" (piano §11). Se non trova un match ad alta
 * confidenza per una riga, la lascia semplicemente senza wikidata_id.
 *
 * ── Fonte (già verificata e in produzione in questo repository) ────────────────────────────────
 * `lib/pois/wikidataSource.ts` interroga già dal vivo l'endpoint SPARQL pubblico ufficiale
 * `https://query.wikidata.org/sparql` (POST, Accept: application/sparql-results+json) — stesso
 * endpoint/pattern riusato qui, non un URL indovinato. La differenza rispetto a quel file: qui il
 * bersaglio è `SiteType`/`PlaceCategory` (piano `lib/metaTypes.ts`) invece di `PoiType`, e la query
 * cerca per NOME+prossimità invece che per bbox (questo script arricchisce righe puntuali già
 * note, non scopre nuovi POI in un'area).
 *
 * Bloccante di rete: query.wikidata.org è bloccato dal proxy di questo ambiente (stessa policy di
 * ISTAT/PTPR/MiC/OSM, verificato con `curl -v`) — non eseguito contro l'endpoint reale in questa
 * sessione. La logica di matching (`pickBestWikidataMatch`) è pura e testata con fixture.
 *
 * Usage:
 *   npx tsx scripts/places/wikidata/enrich.ts [--dry-run] [--region Lazio] [--limit 200]
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nameTokenSimilarity } from '../normalize'
import { haversineM } from '../../../lib/geoUtils'

const USER_AGENT = 'DTrek/1.0 (places catalog enrichment; mzulpt@gmail.com)'
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'

// Raggio di ricerca SPARQL attorno alla riga da arricchire — README della cartella indica "raggio
// piccolo, es. 200m": abbastanza stretto da escludere quasi certamente un omonimo diverso, largo
// abbastanza da coprire l'incertezza tipica di un centroide (comune, area PTPR, nodo OSM).
const SEARCH_RADIUS_M = 200

// Sopra questa soglia di similarità nome, un singolo risultato Wikidata nel raggio è considerato
// un match sicuro. Più permissivo della soglia di dedup multi-fattore in deduplicate.ts perché qui
// la prossimità è già stata garantita dal filtro SPARQL (raggio di ricerca), non solo un fattore
// tra altri — il nome è l'unico segnale rimasto da verificare.
const NAME_MATCH_THRESHOLD = 0.5

export interface DtrekPlaceRow {
  id: string
  name: string
  latitude: number
  longitude: number
}

export interface WikidataCandidate {
  qid: string
  label: string
  lat: number
  lon: number
}

export interface WikidataMatch {
  qid: string
  confidence: number
}

// Pura, testabile senza rete — sceglie il miglior candidato Wikidata per una riga dtrek_places già
// filtrata per raggio (il chiamante fa la query SPARQL con il bbox, qui si decide solo se il nome
// combacia abbastanza da considerarlo un match). Nessun match → null, MAI un fallback "il più
// vicino a prescindere dal nome" (piano §14, stesso principio del dedup multi-fonte: un match
// incerto non va fuso).
export function pickBestWikidataMatch(place: DtrekPlaceRow, nearby: WikidataCandidate[]): WikidataMatch | null {
  let best: WikidataMatch | null = null
  for (const cand of nearby) {
    const nameScore = nameTokenSimilarity(place.name, cand.label)
    if (nameScore < NAME_MATCH_THRESHOLD) continue
    if (!best || nameScore > best.confidence) best = { qid: cand.qid, confidence: nameScore }
  }
  return best
}

// ── I/O: Supabase (righe da arricchire) ──────────────────────────────────────────────────────
async function findPlacesWithoutWikidataId(supabase: SupabaseClient, region: string | null, limit: number): Promise<DtrekPlaceRow[]> {
  let query = supabase
    .from('dtrek_places')
    .select('id, name, latitude, longitude')
    .is('wikidata_id', null)
    .limit(limit)
  if (region) query = query.eq('region', region)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DtrekPlaceRow[]
}

async function updateWikidataId(supabase: SupabaseClient, placeId: string, qid: string): Promise<void> {
  // UPDATE, mai un upsert/insert — questo script non crea righe (piano §11).
  const { error } = await supabase.from('dtrek_places').update({ wikidata_id: qid }).eq('id', placeId)
  if (error) throw error
}

// ── I/O: Wikidata SPARQL ─────────────────────────────────────────────────────────────────────
function buildQuery(lat: number, lon: number, radiusM: number): string {
  // wikibase:around — stesso servizio SPARQL federato usato per il bbox in
  // lib/pois/wikidataSource.ts, qui con un centro+raggio invece di un box, più naturale per
  // "punti vicini a QUESTA riga" invece di "tutto in quest'area".
  const radiusKm = (radiusM / 1000).toFixed(3)
  return `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en" }
}
LIMIT 20`
}

async function queryNearbyWikidata(lat: number, lon: number): Promise<WikidataCandidate[]> {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
    body: `query=${encodeURIComponent(buildQuery(lat, lon, SEARCH_RADIUS_M))}`,
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`)

  const data: { results: { bindings: Record<string, { value: string }>[] } } = await res.json()
  const out: WikidataCandidate[] = []
  for (const row of data.results.bindings) {
    const qid = row.item?.value?.split('/').pop()
    const label = row.itemLabel?.value
    const m = row.coord?.value?.match(/Point\(([^\s]+)\s+([^)]+)\)/)
    if (!qid || !label || !m) continue
    const lon2 = parseFloat(m[1]), lat2 = parseFloat(m[2])
    if (Number.isNaN(lat2) || Number.isNaN(lon2)) continue
    // Doppio controllo lato client — wikibase:around è già filtrato per raggio, ma un margine di
    // sicurezza costa nulla ed evita di fidarsi ciecamente del servizio federato.
    if (haversineM(lat, lon, lat2, lon2) > SEARCH_RADIUS_M * 1.5) continue
    out.push({ qid, label, lat: lat2, lon: lon2 })
  }
  return out
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const regionIdx = process.argv.indexOf('--region')
  const region = regionIdx !== -1 ? process.argv[regionIdx + 1] : 'Lazio'
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : 200

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const places = await findPlacesWithoutWikidataId(supabase, region, limit)
  console.log(`${places.length} righe senza wikidata_id (regione: ${region ?? 'tutte'}).`)

  let matched = 0, unmatched = 0
  for (const place of places) {
    const nearby = await queryNearbyWikidata(place.latitude, place.longitude)
    const match = pickBestWikidataMatch(place, nearby)
    if (!match) { unmatched++; continue }

    matched++
    if (DRY_RUN) {
      console.log(`[DRY RUN] ${place.name} → ${match.qid} (confidence ${match.confidence.toFixed(2)})`)
    } else {
      await updateWikidataId(supabase, place.id, match.qid)
      console.log(`${place.name} → ${match.qid} (confidence ${match.confidence.toFixed(2)})`)
    }
  }

  console.log(`Fatto: ${matched} arricchite${DRY_RUN ? ' (dry-run, nessuna scrittura)' : ''}, ${unmatched} senza match.`)
}

const isDirectRun = process.argv[1]?.endsWith('enrich.ts')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
