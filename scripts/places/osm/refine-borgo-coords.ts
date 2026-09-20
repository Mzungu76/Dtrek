/**
 * OSM `place=*` (dal vivo, Overpass) → raffina lat/lon dei Borghi/Città già in dtrek_places
 *
 * Diverso da scripts/places/osm/fetch.ts (che importa musei/castelli/monumenti da un estratto
 * .pbf offline, piano §9/§21/§48.7 — "MAI Overpass live come motore principale della ricerca [del
 * catalogo]") e da wikidata/enrich.ts (stesso principio di questo file: opera SOLO in UPDATE su
 * righe già esistenti, MAI un INSERT — non scopre nuove entità, quindi non è "il motore di ricerca
 * del catalogo" nel senso vietato da quel principio, lo stesso ragionamento già applicato lì).
 *
 * Perché serve: il centroide ISTAT di un Comune (scripts/places/istat/fetch.ts) è il centro
 * geometrico dell'INTERO territorio amministrativo — un Comune esteso e irregolare può avere il
 * proprio borgo storico a diversi km dal centroide del suo territorio (osservato dal vivo: Nepi
 * ancora a ~2,6km da un punto di interesse verificato al suo interno anche DOPO il fix del
 * centroide, piano §41). Un nodo OSM `place=city/town/village/hamlet` è invece esattamente il
 * punto che qualunque mappa basata su OSM disegna come "il paese" — la fonte più diretta possibile
 * per questo scopo specifico, mai un poligono/centroide da ricalcolare.
 *
 * ── Perché UNA query per regione, non una per Comune (riprogettato dopo il primo run reale) ─────
 * La primissima versione faceva una query Overpass per OGNI Comune (378 per il solo Lazio) — oltre
 * a essere lentissimo (~18s/riga in media, quasi 2 ore per una sola regione), un ritmo così alto di
 * richieste indipendenti innescava un rate-limit sull'IP condivisa dei runner GitHub Actions (38%
 * di fallimenti osservati dal vivo). Tutta Italia (7896 Comuni) in quel modo avrebbe richiesto
 * GIORNI, non ore. Qui invece UNA query sola recupera TUTTI i nodi place= dentro il bbox di
 * un'INTERA regione (migliaia di Comuni/frazioni in un colpo), e l'abbinamento con ciascun Borgo/
 * Città avviene poi in memoria (haversineM, nessuna rete) — lo stesso pattern già usato altrove nel
 * repo per un bbox esteso (lib/routeBuilder/hikingProbability.ts, lib/routeBuilder/osmGraph.ts):
 * un fetch, molte righe elaborate localmente. Da ~7896 richieste sequenziali a ~20 (una per
 * regione) — l'intera Italia rientra comodamente nel tetto di 6 ore di un job GitHub Actions.
 *
 * Bloccante di rete: overpass-api.de (e mirror) è bloccato dal proxy di ogni sandbox di sviluppo
 * usata finora (stessa policy di ISTAT/Wikidata/MiC) — solo il runner GitHub Actions ci arriva
 * (vedi .github/workflows/import-places-osm-refine.yml).
 *
 * Usage:
 *   npx tsx scripts/places/osm/refine-borgo-coords.ts [--dry-run] [--region Lazio]
 *
 * `--region` omesso: elabora TUTTE le regioni presenti in dtrek_places, una dopo l'altra, ciascuna
 * con la propria unica query Overpass — è il modo giusto per "tutta Italia", non un limite da
 * aggirare come nella versione precedente (quella sì, sconsigliata in un lancio solo).
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchOverpass, padBbox } from '../../../lib/overpassTrails'
import { haversineM } from '../../../lib/geoUtils'
import { nameTokenSimilarity, sameMunicipality } from '../normalize'

// Raggio di ricerca attorno alla coordinata attuale — più largo dei 200m di wikidata/enrich.ts:
// qui il punto di partenza è un centroide di poligono amministrativo, non già un punto affidabile,
// quindi il vero borgo può stare a diversi km di distanza (vedi il commento in cima al file, Nepi
// ancora a ~2,6km dopo il fix del centroide). 10km copre comodamente anche un Comune grande e
// irregolare senza rischiare di uscire nel territorio di un Comune vicino con un nome simile.
const SEARCH_RADIUS_KM = 10

// Margine attorno al bbox di TUTTI i Borghi/Città di una regione, prima di interrogare Overpass —
// deve superare SEARCH_RADIUS_KM: un Borgo vicino al confine regionale deve poter trovare un nodo
// place= appena fuori da quel confine (i confini amministrativi non hanno alcun significato per
// dove OSM piazza un nodo place=). 20km lascia margine comodo sopra i 10km di ricerca.
const REGION_BBOX_PADDING_KM = 20

// Sotto questa similarità token, un nodo place= nel raggio non è considerato un match — un match
// esatto (dopo normalizzazione: minuscolo, accenti rimossi) vale sempre 1.0 a prescindere da questa
// soglia, che si applica solo al fallback "quasi uguale" (es. differenze di spaziatura/punteggiatura).
const NAME_MATCH_THRESHOLD = 0.6

const PLACE_TAGS = ['city', 'town', 'village', 'hamlet']

export interface DtrekBorgoRow {
  id: string
  name: string
  latitude: number
  longitude: number
}

export interface OsmPlaceCandidate {
  osmId: number
  place: string
  name: string
  lat: number
  lon: number
}

export interface OsmPlaceMatch {
  osmId: number
  name: string
  lat: number
  lon: number
  confidence: number
}

// Pura, testabile senza rete — sceglie il miglior nodo place= per una riga borgo_citta già
// filtrata per raggio (il chiamante filtra il risultato della query Overpass per regione entro
// SEARCH_RADIUS_KM da QUESTO borgo, qui si decide solo quale dei risultati, se uno, è davvero lo
// stesso posto). Nessun match → null, MAI un fallback "il più vicino a prescindere dal nome" — un
// centro abitato con un nome diverso nello stesso raggio non è il Comune che stiamo cercando, per
// quanto vicino.
export function pickBestOsmPlaceMatch(borgo: DtrekBorgoRow, nearby: OsmPlaceCandidate[]): OsmPlaceMatch | null {
  let best: OsmPlaceMatch | null = null
  let bestDistM = Infinity
  for (const cand of nearby) {
    const exact = sameMunicipality(borgo.name, cand.name) // stessa normalizzazione nome, non un confronto amministrativo qui
    const score = exact ? 1 : nameTokenSimilarity(borgo.name, cand.name)
    if (score < NAME_MATCH_THRESHOLD) continue
    const distM = haversineM(borgo.latitude, borgo.longitude, cand.lat, cand.lon)
    // A parità di punteggio nome, vince il più vicino alla coordinata attuale — fra più
    // insediamenti con nome plausibile nello stesso raggio (raro ma possibile: una frazione con
    // nome simile al capoluogo), il più vicino al centroide amministrativo resta l'indizio più
    // affidabile rimasto.
    if (!best || score > best.confidence || (score === best.confidence && distM < bestDistM)) {
      best = { osmId: cand.osmId, name: cand.name, lat: cand.lat, lon: cand.lon, confidence: score }
      bestDistM = distM
    }
  }
  return best
}

// ── I/O: Supabase ─────────────────────────────────────────────────────────────────────────────
// PostgREST (Supabase) applica un tetto di default alle righe restituite da una query SENZA
// `.range()` esplicito — osservato dal vivo in un run reale: Lombardia (1502 Comuni) e Piemonte
// (1180) troncate silenziosamente a ESATTAMENTE 1000 ciascuna, 682 righe perse in tutto (nessun
// errore, nessun avviso — la query "riesce" e basta, restituendo un sottoinsieme senza dirlo). Le
// due funzioni sotto paginano esplicitamente con `.range()` finché una pagina non torna più corta
// della dimensione richiesta, invece di fidarsi che un singolo `.select()` porti sempre tutto:
// l'unico modo di reggere ANCHE una crescita futura oltre l'attuale tetto (che potrebbe cambiare),
// non solo il caso di oggi.
const SUPABASE_PAGE_SIZE = 1000

async function fetchAllPages<T>(supabase: SupabaseClient, buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + SUPABASE_PAGE_SIZE - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < SUPABASE_PAGE_SIZE) break
  }
  return all
}

async function findAllRegions(supabase: SupabaseClient): Promise<string[]> {
  const rows = await fetchAllPages<{ region: string }>(supabase, (from, to) =>
    supabase.from('dtrek_places').select('region').eq('meta_type', 'borgo_citta').not('region', 'is', null).range(from, to),
  )
  return Array.from(new Set(rows.map(r => r.region))).sort()
}

async function findBorghiInRegion(supabase: SupabaseClient, region: string): Promise<DtrekBorgoRow[]> {
  return fetchAllPages<DtrekBorgoRow>(supabase, (from, to) =>
    supabase.from('dtrek_places').select('id, name, latitude, longitude').eq('meta_type', 'borgo_citta').eq('region', region).range(from, to),
  )
}

async function updateCoords(supabase: SupabaseClient, placeId: string, lat: number, lon: number): Promise<void> {
  // UPDATE mirato su lat/lon soltanto — mai un upsert/insert, questo script non crea righe e non
  // tocca nessun altro campo (provincia/regione/codice ISTAT restano di competenza di quella fonte).
  const { error } = await supabase.from('dtrek_places').update({ latitude: lat, longitude: lon }).eq('id', placeId)
  if (error) throw error
}

// ── I/O: Overpass ────────────────────────────────────────────────────────────────────────────
interface OverpassPlaceEl { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// fetchOverpass (lib/overpassTrails.ts) già raccorda 3 mirror e ritenta una volta — non basta
// contro un blip più lungo su una query pesante come questa (l'intero bbox di una regione, non un
// singolo punto). Backoff ESPONENZIALE (secondi, non gli 1.2s fissi di fetchOverpass) sopra quel
// primo livello, stesso principio già applicato a wikidata/enrich.ts per il proprio endpoint — qui
// il costo di un tentativo in più è trascurabile: sono solo ~20 query in tutto (una per regione),
// non migliaia, quindi anche diversi tentativi falliti pesano pochi minuti sul totale, non ore.
const MAX_QUERY_RETRIES = 3

// timeout più alto del vecchio schema per-Comune (20s): il bbox è quello di un'intera regione,
// potenzialmente migliaia di nodi place= da restituire — [maxsize] esplicito perché il default di
// Overpass può troncare silenziosamente un risultato grande (stesso principio già applicato alle
// query più pesanti di osmGraph.ts/hikingProbability.ts).
const REGION_QUERY_TIMEOUT_MS = 90_000

async function fetchPlaceNodesInBbox(bbox: [number, number, number, number]): Promise<OsmPlaceCandidate[]> {
  const [minLat, minLon, maxLat, maxLon] = bbox
  const query = `[out:json][timeout:${Math.floor(REGION_QUERY_TIMEOUT_MS / 1000)}][maxsize:268435456];
node["place"~"^(${PLACE_TAGS.join('|')})$"](${minLat},${minLon},${maxLat},${maxLon});
out body qt;`

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_QUERY_RETRIES; attempt++) {
    if (attempt > 0) await sleep(4000 * 2 ** (attempt - 1)) // 4s, 8s, 16s
    try {
      const json = await fetchOverpass<{ elements: OverpassPlaceEl[] }>(query, REGION_QUERY_TIMEOUT_MS)
      const out: OsmPlaceCandidate[] = []
      for (const el of json.elements ?? []) {
        const name = el.tags?.name
        const place = el.tags?.place
        if (!name || !place) continue
        out.push({ osmId: el.id, place, name, lat: el.lat, lon: el.lon })
      }
      return out
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Overpass: troppi tentativi falliti')
}

// Bbox di tutti i Borghi/Città di una regione, con il margine di sicurezza sopra — stesso principio
// di app/api/route-build/multi-stop/step/network/route.ts per il bbox di più tappe.
function regionBbox(borghi: DtrekBorgoRow[]): [number, number, number, number] {
  const raw: [number, number, number, number] = [
    Math.min(...borghi.map(b => b.latitude)),
    Math.min(...borghi.map(b => b.longitude)),
    Math.max(...borghi.map(b => b.latitude)),
    Math.max(...borghi.map(b => b.longitude)),
  ]
  return padBbox(raw, REGION_BBOX_PADDING_KM)
}

interface RegionResult { refined: number; unmatched: number }

async function refineRegion(supabase: SupabaseClient, region: string, dryRun: boolean): Promise<RegionResult> {
  const borghi = await findBorghiInRegion(supabase, region)
  console.log(`=== ${region}: ${borghi.length} Borghi/Città ===`)
  if (borghi.length === 0) return { refined: 0, unmatched: 0 }

  // UNA query per l'intera regione — non una per Comune, vedi il commento in cima al file.
  const allNodes = await fetchPlaceNodesInBbox(regionBbox(borghi))
  console.log(`${region}: ${allNodes.length} nodi place= trovati nel bbox della regione.`)

  let refined = 0, unmatched = 0
  for (const borgo of borghi) {
    // Filtro per raggio IN MEMORIA (nessuna rete) — pickBestOsmPlaceMatch riceve solo i nodi
    // abbastanza vicini a QUESTO borgo, esattamente come nella versione con una query per riga,
    // solo che qui il filtro avviene su un risultato già scaricato una volta sola per tutti.
    const nearby = allNodes.filter(n => haversineM(borgo.latitude, borgo.longitude, n.lat, n.lon) <= SEARCH_RADIUS_KM * 1000)
    const match = pickBestOsmPlaceMatch(borgo, nearby)
    if (!match) { unmatched++; continue }

    const movedM = haversineM(borgo.latitude, borgo.longitude, match.lat, match.lon)
    refined++
    // Distanza di spostamento inclusa nel log — un abbinamento che non si sposta quasi per nulla
    // (già corretto) è distinguibile a colpo d'occhio da uno spostamento di km senza dover
    // controllare a mano.
    if (dryRun) {
      console.log(`[DRY RUN] ${borgo.name} → nodo OSM ${match.osmId} "${match.name}" (confidence ${match.confidence.toFixed(2)}, spostamento ${(movedM / 1000).toFixed(2)}km)`)
    } else {
      await updateCoords(supabase, borgo.id, match.lat, match.lon)
      console.log(`${borgo.name} → nodo OSM ${match.osmId} "${match.name}" (confidence ${match.confidence.toFixed(2)}, spostamento ${(movedM / 1000).toFixed(2)}km)`)
    }
  }
  return { refined, unmatched }
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const regionIdx = process.argv.indexOf('--region')
  const singleRegion = regionIdx !== -1 ? process.argv[regionIdx + 1] : null

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const regions = singleRegion ? [singleRegion] : await findAllRegions(supabase)
  console.log(`Regioni da elaborare: ${regions.join(', ')}`)

  let totalRefined = 0, totalUnmatched = 0, totalErrored = 0
  for (const [i, region] of regions.entries()) {
    // Pausa fra una regione e l'altra — non più per riga come nella versione precedente (qui non
    // serve più: una sola richiesta pesante per regione, non centinaia di richieste leggere), solo
    // per non incalzare Overpass con una query pesante subito dopo l'altra.
    if (i > 0) await sleep(2000)
    try {
      const { refined, unmatched } = await refineRegion(supabase, region, DRY_RUN)
      totalRefined += refined
      totalUnmatched += unmatched
    } catch (e) {
      // Una regione fallita (Overpass irraggiungibile anche dopo i ritentativi) non deve bloccare
      // le altre — loggarla e proseguire; ririlanciare lo script con --region su quella sola
      // recupera il resto senza dover rifare tutta Italia da capo.
      totalErrored++
      console.error(`${region}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`Fatto: ${totalRefined} raffinate${DRY_RUN ? ' (dry-run, nessuna scrittura)' : ''}, ${totalUnmatched} senza match, ${totalErrored} regioni fallite (ririlanciare con --region su quelle).`)
}

const isDirectRun = process.argv[1]?.endsWith('refine-borgo-coords.ts')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
