// "Opere di questo museo" — docs/opere-musei-wikidata.md/docs/arco-opere-musei.md.
//
// ArCo (Catalogo Generale dei Beni Culturali) è stato scartato: il meccanismo tecnico funziona ma
// la copertura reale è insufficiente (~8 musei ben catalogati su 2.296 già in Dtrek — vedi
// docs/arco-opere-musei.md). Wikidata (wdt:P195 collezione, wdt:P276 ubicazione) dà una copertura
// nettamente migliore per i musei importanti (Galleria Borghese 240 opere, Musei Capitolini 302),
// ma resta 0 per la maggioranza dei musei locali/tematici — atteso, non un errore: "opere d'arte
// catalogate" non è un concetto pertinente per una casa museo dedicata a uno sportivo o un museo
// del contrabbando.
//
// Verifica utente: invece di un import batch di tutti i musei (impraticabile — una sessione
// manuale ne ha arricchiti 28 in un lotto, ~2.268 restanti), l'arricchimento avviene DAL VIVO alla
// prima apertura della Guida di QUEL museo specifico — stesso principio già usato da
// lib/placePhotoCache.ts (foto di copertina) e app/api/borgo-itinerary/route.ts (itinerario a
// piedi): cache-poi-fetch-poi-salva, mai un'eccezione propagata al chiamante.
//
// A differenza di lib/placePhotoCache.ts (dove un esito negativo È indistinguibile da un
// fallimento temporaneo e va sempre riprovato), qui un array vuoto è quasi sempre un FATTO reale
// del museo (nessuna opera catalogata su Wikidata) — cachato con TTL lungo (90 giorni,
// supabase/migrations/add_dtrek_places_opere_cache.sql), non riprovato ad ogni apertura.
import type { SupabaseClient } from '@supabase/supabase-js'

const SEARCH_ENDPOINT = 'https://www.wikidata.org/w/api.php'
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'DTrek/1.0 (places catalog enrichment; mzulpt@gmail.com)'

// Stesso raggio/soglia già validati in produzione da scripts/places/wikidata/enrich.ts (28 musei
// arricchiti in un lotto manuale, 2026-09-27) — coerenza tra arricchimento batch e live, mai due
// criteri diversi per la stessa decisione ("questo QID è davvero questo museo?").
const SEARCH_RADIUS_M = 200
const NAME_MATCH_THRESHOLD = 0.5
const MAX_OPERE = 24
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

export interface MuseumOpera {
  title: string
  image?: string
  creator?: string
  year?: string
  wikidataId: string
}

// ── Testo: duplicato minimo di scripts/places/normalize.ts (nameTokenSimilarity/
// normalizeForComparison) — quel modulo è sotto scripts/, ESCLUSO dal tsconfig dell'app
// (tsconfig.json: "exclude": ["scripts"]) apposta perché gira solo via tsx, mai nel bundle
// Next.js. Stessa logica, mai divergente: se cambia lì per una ragione (piano §41), va cambiata
// anche qui.
const COMBINING_DIACRITICS_RE = /[̀-ͯ]/g

// Niente flag `u`/\p{L} qui (a differenza di scripts/places/normalize.ts, che gira via tsx con un
// target moderno): il tsconfig dell'app non fissa un `target` esplicito, e la combinazione
// lib=esnext/target implicito rifiuta sia il flag `u` che l'iterazione diretta di un Set. Dopo lo
// strip dei diacritici sopra, un nome italiano reale è già solo lettere ASCII/cifre/spazi — un
// range esplicito basta, mai bisogno delle unicode property escapes qui.
export function normalizeForComparison(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(COMBINING_DIACRITICS_RE, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function nameTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeForComparison(a).split(' ').filter(Boolean))
  const tokensB = new Set(normalizeForComparison(b).split(' ').filter(Boolean))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersection = 0
  tokensA.forEach(t => { if (tokensB.has(t)) intersection++ })
  const union = tokensA.size + tokensB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// ── Query costruction (pure, testabili senza rete) ──────────────────────────────────────────────

interface WikidataCandidate { qid: string; label: string; lat: number; lon: number }

// FIX (2026-09-27, bug segnalato dal vivo dall'utente su "Galleria Doria Pamphilj", Roma centro
// storico): senza ORDER BY, il LIMIT 20 prende una fetta ARBITRARIA dei candidati nel raggio —
// non necessariamente i più vicini. In un centro storico denso (centinaia di elementi Wikidata
// con coordinate in 300m: chiese, palazzi, statue, fontane) il vero bersaglio può restare fuori
// da quei 20 per puro caso, anche a 49m di distanza (verificato reale: Q1203458, 49m dal punto
// Dtrek, MAI comparso tra i 20 risultati della query senza ordinamento). `wikibase:distance`
// (parametro documentato del servizio geospaziale di Wikidata Query Service) espone la distanza
// come variabile legabile — `ORDER BY ASC(?distance)` PRIMA del LIMIT garantisce che i 20 tenuti
// siano davvero i più vicini, non una fetta qualunque.
export function buildNearbyQuery(lat: number, lon: number, radiusM = SEARCH_RADIUS_M): string {
  const radiusKm = (radiusM / 1000).toFixed(3)
  return `
SELECT DISTINCT ?item ?itemLabel ?coord WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
    bd:serviceParam wikibase:distance ?distance .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en" }
}
ORDER BY ASC(?distance)
LIMIT 20`
}

// wdt:P31/wdt:P279* wd:Q838948 ("opera d'arte", con sottoclassi transitive: dipinto, scultura,
// disegno, fotografia, ...) — NON opzionale, filtro obbligatorio. Aggiunto dopo un'anomalia reale
// trovata su Galleria Borghese (docs/opere-musei-wikidata.md §2.4): senza questo filtro,
// wdt:P276 (ubicazione) include anche eventi/mostre temporanee ospitate al museo ("Cranach. L'altro
// rinascimento" comparso come risultato, non un'opera della collezione).
//
// FIX (2026-09-27, bug segnalato dal vivo dall'utente su un museo di Gubbio — 4 card identiche
// per la STESSA opera): senza DISTINCT, un'opera che soddisfa SIA P195 SIA P276 per lo stesso
// museo viene restituita due volte dalla UNION — e il filtro tipo (`P31/P279*`, un percorso di
// proprietà con chiusura transitiva) può aggiungere altre righe se l'opera ha più dichiarazioni
// P31 che raggiungono Q838948 per strade diverse. Sotto-query con `SELECT DISTINCT ?opera` PRIMA
// del LIMIT (cruciale: senza, il limite tronca su righe duplicate, restituendo MENO opere
// distinte del richiesto) — i JOIN OPTIONAL (immagine/autore/data) restano nella query esterna,
// dove un'opera con PIÙ valori per uno di questi campi (es. due autori) può ancora produrre righe
// multiple: dedup lato client per wikidataId in fetchMuseumOpere sotto, difesa in profondità.
export function buildWorksQuery(qid: string, limit = MAX_OPERE): string {
  return `
SELECT ?opera ?operaLabel ?image ?creatorLabel ?inception WHERE {
  {
    SELECT DISTINCT ?opera WHERE {
      { ?opera wdt:P195 wd:${qid} . }
      UNION
      { ?opera wdt:P276 wd:${qid} . }
      ?opera wdt:P31/wdt:P279* wd:Q838948 .
    }
    LIMIT ${limit}
  }
  OPTIONAL { ?opera wdt:P18 ?image . }
  OPTIONAL { ?opera wdt:P170 ?creator . }
  OPTIONAL { ?opera wdt:P571 ?inception . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en" . }
}`
}

// ── I/O: Wikidata (nessuna scrittura, solo lettura) ─────────────────────────────────────────────

async function sparqlSelect(query: string): Promise<Record<string, { value: string }>[]> {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
    body: `query=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}`)
  const data = await res.json() as { results?: { bindings?: Record<string, { value: string }>[] } }
  return data.results?.bindings ?? []
}

// Stessa logica (raggio+soglia nome) di scripts/places/wikidata/enrich.ts's queryNearbyWikidata/
// pickBestWikidataMatch — qui per UN solo museo alla volta invece di un lotto, nessun retry con
// backoff (un fallimento qui è un fallimento dell'intera richiesta della Guida, non di un lotto
// batch dove riprovare ha senso): un solo tentativo, l'eventuale prossima apertura della Guida
// riprova da sola (wikidata_id resta NULL finché non trova un match).
async function findMuseumWikidataId(name: string, lat: number, lon: number): Promise<{ qid: string; label: string } | null> {
  const rows = await sparqlSelect(buildNearbyQuery(lat, lon))
  const candidates: WikidataCandidate[] = []
  for (const row of rows) {
    const qid = row.item?.value?.split('/').pop()
    const label = row.itemLabel?.value
    const m = row.coord?.value?.match(/Point\(([^\s]+)\s+([^)]+)\)/)
    if (!qid || !label || !m) continue
    const lon2 = parseFloat(m[1]), lat2 = parseFloat(m[2])
    if (Number.isNaN(lat2) || Number.isNaN(lon2)) continue
    if (haversineM(lat, lon, lat2, lon2) > SEARCH_RADIUS_M * 1.5) continue
    candidates.push({ qid, label, lat: lat2, lon: lon2 })
  }
  let best: { qid: string; label: string; confidence: number } | null = null
  for (const cand of candidates) {
    const score = nameTokenSimilarity(name, cand.label)
    if (score < NAME_MATCH_THRESHOLD) continue
    if (!best || score > best.confidence) best = { qid: cand.qid, label: cand.label, confidence: score }
  }
  return best ? { qid: best.qid, label: best.label } : null
}

// Pura, testabile senza rete. Dedup per wikidataId — difesa in profondità oltre al DISTINCT nella
// sotto-query di buildWorksQuery: un'opera con più valori per un OPTIONAL (es. due autori) produce
// comunque righe multiple nel join esterno. Tiene la PRIMA occorrenza (i campi di quella riga,
// mai un merge tra righe diverse della stessa opera — troppo rischioso indovinare quale
// combinazione autore/immagine/anno è quella "giusta").
export function dedupeByWikidataId(opere: MuseumOpera[]): MuseumOpera[] {
  const seen = new Set<string>()
  const out: MuseumOpera[] = []
  for (const o of opere) {
    if (seen.has(o.wikidataId)) continue
    seen.add(o.wikidataId)
    out.push(o)
  }
  return out
}

async function fetchMuseumOpere(qid: string): Promise<MuseumOpera[]> {
  const rows = await sparqlSelect(buildWorksQuery(qid))
  const out: MuseumOpera[] = []
  for (const row of rows) {
    const title = row.operaLabel?.value
    const wikidataId = row.opera?.value?.split('/').pop()
    if (!title || !wikidataId) continue
    out.push({
      title,
      wikidataId,
      image: row.image?.value,
      creator: row.creatorLabel?.value,
      // P571 (data di inizio/creazione) è un timestamp ISO completo — solo l'anno serve qui.
      year: row.inception?.value?.slice(0, 4),
    })
  }
  return dedupeByWikidataId(out)
}

// ── Cache su dtrek_places (opere_cache/opere_cached_at, wikidata_id) ────────────────────────────

interface MuseumForOpere {
  id: string
  name: string
  latitude: number
  longitude: number
  wikidataId: string | null
}

/**
 * Opere collegate a `place` (un museo), con cache su dtrek_places. Mai un'eccezione: un
 * fallimento di rete/migration mancante qui non deve mai far fallire la Guida — solo restituire
 * [] e lasciare la cache invariata per un prossimo tentativo (stesso principio di
 * lib/placePhotoCache.ts).
 *
 * `opere_cache`/`opere_cached_at` letti QUI, con una select ISOLATA dal chiamante (mai aggiunti
 * alla select principale di app/api/places/[id]/route.ts) — stesso motivo già documentato lì per
 * image_credit/image_checked_at e phone/email: finché
 * supabase/migrations/add_dtrek_places_opere_cache.sql non è applicata su un dato progetto
 * Supabase, selezionare queste colonne nella query principale farebbe fallire con un 500 la
 * scheda di OGNI Meta, non solo quelle museo. `wikidataId` invece arriva dal chiamante: quella
 * colonna esisteva già prima di questo file, già nella select principale.
 */
export async function getMuseumOpere(supabase: SupabaseClient, place: MuseumForOpere): Promise<MuseumOpera[]> {
  try {
    const { data: cached, error: cacheError } = await supabase
      .from('dtrek_places')
      .select('opere_cache, opere_cached_at')
      .eq('id', place.id)
      .maybeSingle()
    if (cacheError) throw cacheError

    const opereCache = (cached?.opere_cache as MuseumOpera[] | null) ?? null
    const opereCachedAt = (cached?.opere_cached_at as string | null) ?? null
    const cachedAt = opereCachedAt ? new Date(opereCachedAt).getTime() : 0
    if (opereCache && Date.now() - cachedAt < CACHE_TTL_MS) {
      return opereCache
    }

    let qid = place.wikidataId
    if (!qid) {
      const found = await findMuseumWikidataId(place.name, place.latitude, place.longitude).catch(e => {
        console.error('[museumOpere] ricerca QID fallita:', e)
        return null
      })
      if (found) {
        qid = found.qid
        // Positivo, definitivo — mai un motivo di ricercarlo di nuovo (stesso principio di
        // placePhotoCache per un image_url trovato). Fire-and-forget: non deve rallentare la
        // risposta della Guida.
        supabase.from('dtrek_places').update({ wikidata_id: qid }).eq('id', place.id).then(
          ({ error }) => { if (error) console.error('[museumOpere] aggiornamento wikidata_id fallito:', error.message) },
          (e: unknown) => console.error('[museumOpere] aggiornamento wikidata_id fallito:', e),
        )
      }
    }
    if (!qid) return []

    const opere = await fetchMuseumOpere(qid).catch(e => {
      console.error('[museumOpere] ricerca opere fallita:', e)
      return null
    })
    if (opere === null) return opereCache ?? [] // fallimento di rete: mai cachare, mai perdere un risultato precedente

    // Array vuoto CACHATO (a differenza di itinerary_cache): qui "0 opere" è quasi sempre un fatto
    // reale del museo, non un fallimento silenzioso — vedi commento in cima al file.
    supabase.from('dtrek_places').update({ opere_cache: opere, opere_cached_at: new Date().toISOString() }).eq('id', place.id).then(
      ({ error }) => { if (error) console.error('[museumOpere] aggiornamento opere_cache fallito:', error.message) },
      (e: unknown) => console.error('[museumOpere] aggiornamento opere_cache fallito:', e),
    )
    return opere
  } catch (e) {
    console.error('[museumOpere] non disponibile (migration non applicata?):', e)
    return []
  }
}
