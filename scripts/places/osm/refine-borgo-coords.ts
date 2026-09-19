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
 * Bloccante di rete: overpass-api.de (e mirror) è bloccato dal proxy di ogni sandbox di sviluppo
 * usata finora (stessa policy di ISTAT/Wikidata/MiC) — solo il runner GitHub Actions ci arriva
 * (vedi .github/workflows/import-places-osm-refine.yml).
 *
 * Usage:
 *   npx tsx scripts/places/osm/refine-borgo-coords.ts [--dry-run] [--region Lazio] [--limit 500]
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
// filtrata per raggio (il chiamante fa la query Overpass col bbox, qui si decide solo quale dei
// risultati, se uno, è davvero lo stesso posto). Nessun match → null, MAI un fallback "il più
// vicino a prescindere dal nome" — un centro abitato con un nome diverso nello stesso raggio non è
// il Comune che stiamo cercando, per quanto vicino.
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

// ── I/O: Supabase (righe da raffinare) ───────────────────────────────────────────────────────
async function findBorghi(supabase: SupabaseClient, region: string | null, limit: number): Promise<DtrekBorgoRow[]> {
  let query = supabase
    .from('dtrek_places')
    .select('id, name, latitude, longitude')
    .eq('meta_type', 'borgo_citta')
    .limit(limit)
  if (region) query = query.eq('region', region)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DtrekBorgoRow[]
}

async function updateCoords(supabase: SupabaseClient, placeId: string, lat: number, lon: number): Promise<void> {
  // UPDATE mirato su lat/lon soltanto — mai un upsert/insert, questo script non crea righe e non
  // tocca nessun altro campo (provincia/regione/codice ISTAT restano di competenza di quella fonte).
  const { error } = await supabase.from('dtrek_places').update({ latitude: lat, longitude: lon }).eq('id', placeId)
  if (error) throw error
}

// ── I/O: Overpass ────────────────────────────────────────────────────────────────────────────
interface OverpassPlaceEl { type: 'node'; id: number; lat: number; lon: number; tags?: Record<string, string> }

async function queryNearbyOsmPlaces(lat: number, lon: number): Promise<OsmPlaceCandidate[]> {
  const bbox = padBbox([lat, lon, lat, lon], SEARCH_RADIUS_KM)
  const [minLat, minLon, maxLat, maxLon] = bbox
  const query = `[out:json][timeout:20];
node["place"~"^(${PLACE_TAGS.join('|')})$"](${minLat},${minLon},${maxLat},${maxLon});
out body qt;`
  const json = await fetchOverpass<{ elements: OverpassPlaceEl[] }>(query, 20_000)
  const out: OsmPlaceCandidate[] = []
  for (const el of json.elements ?? []) {
    const name = el.tags?.name
    const place = el.tags?.place
    if (!name || !place) continue
    out.push({ osmId: el.id, place, name, lat: el.lat, lon: el.lon })
  }
  return out
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const regionIdx = process.argv.indexOf('--region')
  const region = regionIdx !== -1 ? process.argv[regionIdx + 1] : 'Lazio'
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : 500

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const borghi = await findBorghi(supabase, region, limit)
  console.log(`${borghi.length} Borghi/Città da raffinare (regione: ${region ?? 'tutte'}).`)

  let refined = 0, unmatched = 0, errored = 0
  for (const [i, borgo] of borghi.entries()) {
    // Spaziatura minima fra richieste — stesso principio di wikidata/enrich.ts: overpass-api.de è
    // un endpoint pubblico condiviso, non dedicato a questo script.
    if (i > 0) await sleep(300)

    try {
      const nearby = await queryNearbyOsmPlaces(borgo.latitude, borgo.longitude)
      const match = pickBestOsmPlaceMatch(borgo, nearby)
      if (!match) { unmatched++; continue }

      const movedM = haversineM(borgo.latitude, borgo.longitude, match.lat, match.lon)
      refined++
      // Distanza di spostamento inclusa nel log — un abbinamento che non si sposta quasi per nulla
      // (già corretto) è distinguibile a colpo d'occhio da uno spostamento di km senza dover
      // controllare a mano.
      if (DRY_RUN) {
        console.log(`[DRY RUN] ${borgo.name} → nodo OSM ${match.osmId} "${match.name}" (confidence ${match.confidence.toFixed(2)}, spostamento ${(movedM / 1000).toFixed(2)}km)`)
      } else {
        await updateCoords(supabase, borgo.id, match.lat, match.lon)
        console.log(`${borgo.name} → nodo OSM ${match.osmId} "${match.name}" (confidence ${match.confidence.toFixed(2)}, spostamento ${(movedM / 1000).toFixed(2)}km)`)
      }
    } catch (e) {
      // Non interrompere l'intero lotto per una riga (rete/Overpass transitorio) — loggarla e
      // proseguire; questo script è idempotente, ririlanciarlo ritenta le righe non ancora
      // aggiornate esattamente come le altre (nessuno stato "già tentato" persistito).
      errored++
      console.error(`${borgo.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`Fatto: ${refined} raffinate${DRY_RUN ? ' (dry-run, nessuna scrittura)' : ''}, ${unmatched} senza match, ${errored} errori (ritenta al prossimo lancio).`)
}

const isDirectRun = process.argv[1]?.endsWith('refine-borgo-coords.ts')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
