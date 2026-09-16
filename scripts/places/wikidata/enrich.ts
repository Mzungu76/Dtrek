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
 * Bloccante di rete: query.wikidata.org è bloccato dal proxy di ogni sandbox di sviluppo usata
 * finora (stessa policy di ISTAT/PTPR/MiC/OSM) — solo il runner GitHub Actions
 * (`.github/workflows/import-places-wikidata.yml`) ci arriva. Eseguito dal vivo per la prima volta
 * il 2026-09-16 su tutto il Lazio (1425 righe): 10 arricchite, poi interrotto da un
 * "Wikidata SPARQL 502" transitorio — vedi il retry con backoff in `queryNearbyWikidata` sotto,
 * aggiunto dopo quel fallimento. La logica di matching (`pickBestWikidataMatch`) è pura e testata
 * con fixture.
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

// query.wikidata.org è un endpoint pubblico condiviso, non dedicato a questo script: sotto un lotto
// di centinaia/migliaia di righe in sequenza può rispondere 502/503/429 in modo transitorio (visto
// dal vivo: run reale su tutto il Lazio, 1425 righe, fallito con "Wikidata SPARQL 502" alla riga
// 11 — senza retry l'intero lotto si interrompe per un singolo blip di rete). Retry con backoff
// esponenziale solo per errori transitori; un 4xx diverso da 429 (query malformata, non un
// problema di carico) fallisce subito, senza ritentare inutilmente.
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 4

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function queryNearbyWikidata(lat: number, lon: number): Promise<WikidataCandidate[]> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1)) // 1s, 2s, 4s, 8s

    let res: Response
    try {
      res = await fetch(SPARQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/sparql-results+json',
          'User-Agent': USER_AGENT,
        },
        body: `query=${encodeURIComponent(buildQuery(lat, lon, SEARCH_RADIUS_M))}`,
        signal: AbortSignal.timeout(20000),
      })
    } catch (e) {
      // Errore di rete/timeout (AbortError incluso) — stesso trattamento di uno status transitorio.
      lastError = e
      continue
    }
    if (res.ok) return parseWikidataResponse(await res.json(), lat, lon)
    if (!TRANSIENT_STATUS.has(res.status)) throw new Error(`Wikidata SPARQL ${res.status}`)
    lastError = new Error(`Wikidata SPARQL ${res.status}`)
  }
  throw lastError instanceof Error ? lastError : new Error('Wikidata SPARQL: troppi tentativi falliti')
}

function parseWikidataResponse(
  data: { results: { bindings: Record<string, { value: string }>[] } },
  lat: number,
  lon: number,
): WikidataCandidate[] {
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

  let matched = 0, unmatched = 0, errored = 0
  for (const [i, place] of places.entries()) {
    // Spaziatura minima fra richieste — endpoint pubblico condiviso, non solo per rispetto: riduce
    // anche la probabilità di essere noi stessi a causare il 502/429 di cui sopra sotto un lotto
    // lungo tutto in sequenza senza pause.
    if (i > 0) await sleep(150)

    try {
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
    } catch (e) {
      // Dopo MAX_RETRIES tentativi falliti (rete/errore transitorio Wikidata): non interrompere
      // l'intero lotto per una riga — loggarla e proseguire con le altre. Il lotto resta comunque
      // idempotente: questa riga (wikidata_id ancora NULL) verrà ritentata al prossimo lancio.
      errored++
      console.error(`${place.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`Fatto: ${matched} arricchite${DRY_RUN ? ' (dry-run, nessuna scrittura)' : ''}, ${unmatched} senza match, ${errored} errori (ritenta al prossimo lancio).`)
}

const isDirectRun = process.argv[1]?.endsWith('enrich.ts')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
