/**
 * MiC (Ministero della Cultura) — "Istituti e luoghi della cultura" (ArCo) → dtrek_places
 *
 * Dataset più ampio della sola componente archeologica già coperta da `lib/pois/gnaSource.ts`
 * (GNA/WFS) — musei, monumenti, castelli, palazzi, chiese, abbazie (piano §8).
 *
 * ── Fonte (verificata via WebSearch/WebFetch in questa sessione, 2026-08-30) ────────────────────
 *
 * Il dataset "Luoghi della cultura" del piano è **ArCo** ("Architettura della Conoscenza"), il
 * knowledge graph ufficiale del MiC (progetto ICCD-MiBACT, https://github.com/ICCD-MiBACT/ArCo).
 * Endpoint SPARQL pubblico, citato dalla home ufficiale del progetto
 * (https://dati.beniculturali.it/arco/index.php?lang=en, sezione "Data Access"):
 *
 *     https://dati.cultura.gov.it/sparql
 *
 * Classe RDF e proprietà VERIFICATE leggendo direttamente il file dell'ontologia (non un URL
 * indovinato — scaricato da GitHub, https://raw.githubusercontent.com/ICCD-MiBACT/ArCo/master/ArCo-release/ontologie/location/location.owl):
 *
 *   - Classe: `http://dati.beniculturali.it/cis/CulturalInstituteOrSite` (CIS = "Cultural
 *     Institute or Site")
 *   - `<...location/hasCulturalInstituteOrSiteType>` — collega l'istituto al suo tipo
 *   - `<...location/hasTimeIndexedTypedLocation>` (domain owl:Thing, quindi anche su CIS) →
 *     `TimeIndexedTypedLocation`, che a sua volta collega via:
 *       - `<...location/atSite>` → `http://dati.beniculturali.it/cis/Site`
 *       - `<...location/atLocation>` → `Feature` (CLV — Core Location Vocabulary AgID), con
 *         `<...location/hasHistoricalAddress>` per l'indirizzo
 *
 * Ogni istanza reale ha un ID numerico stabile nel path (verificato su risultati di ricerca reali,
 * es. `http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/104060`) — è
 * questo l'identificativo MiC usato come `sourceId` sotto (piano §48.12, mai inventato).
 *
 * ── Coordinate: risolto leggendo i dati reali, dopo due tentativi dedotti dalla sola ontologia ──
 * Tentativo 1 (`geo:lat`/`geo:long` su `?site`) e tentativo 2 (`clv:lat`/`clv:long` via
 * `clv:hasGeometry` su CIS/Site/Feature, dedotto da `location.owl`+`CLV-AP_IT.rdf`) hanno dato
 * entrambi 0 risultati contro l'endpoint reale — dedotti dalla documentazione, mai verificati.
 * `runDescribe()` più sotto (`--describe`) ha finalmente dumpato la struttura vera di un
 * CulturalInstituteOrSite reale (7275, Archivio di Stato di Firenze — Fondo Coppedè,
 * 2026-09-17): il collegamento è `cis:hasSite` (confermato, `hasTimeIndexedTypedLocation` non è
 * mai apparso nei dati reali), e la geometria è `clvapit:hasGeometry` sul **Site** stesso →
 * `clvapit:lat`/`clvapit:long` — è l'esempio ufficiale nel commento della classe Site restituito
 * dall'endpoint stesso, non più una deduzione. Nota: quel record specifico NON aveva coordinate
 * popolate (solo un indirizzo strutturato via `cis:siteAddress`) — non è detto che tutti i record
 * ArCo abbiano la geometria, verificare la copertura reale con un dry-run prima di contare su un
 * tasso di successo alto.
 *
 * La tipologia (`hasCulturalInstituteOrSiteType`) punta a una risorsa di un thesaurus MiC di cui
 * non è stato possibile verificare i valori esatti in questa sessione — la classificazione sotto
 * lavora quindi sull'**etichetta testuale** (rdfs:label) della risorsa di tipo, con lo stesso
 * approccio a sottostringa di `GNA_TYPE_MAP` in `lib/pois/gnaSource.ts` (indicato come riferimento
 * dal README di questa cartella) invece che su URI di tipo specifici.
 *
 * ── Licenza (piano §8/§44, CC BY-SA 4.0) ─────────────────────────────────────────────────────
 * Non si richiede/usa nessun campo di descrizione testuale estesa — solo nome, tipologia,
 * indirizzo/comune, coordinate: dati strutturati, non contenuto editoriale, per restare
 * conservativi sul riuso senza aver verificato la licenza specifica di ogni campo testuale.
 *
 * Usage:
 *   npx tsx scripts/places/mic/fetch.ts [--dry-run] [--region Lazio] [--limit 5000]
 *   npx tsx scripts/places/mic/fetch.ts --describe   (diagnostica, vedi runDescribe più sotto)
 *
 * --limit sovrascrive la LIMIT SPARQL (default 5000) — usare un valore piccolo (5-20) per il primo
 * lancio contro l'endpoint reale, dato il punto non verificato sulle coordinate in cima al file:
 * ispezionare l'esempio stampato da --dry-run prima di un caricamento completo.
 */
import { createClient } from '@supabase/supabase-js'
import { importPlaceCandidates } from '../import'
import type { PlaceCandidate } from '../types'
import type { SiteType } from '../../../lib/metaTypes'

const SPARQL_ENDPOINT = 'https://dati.cultura.gov.it/sparql'
const USER_AGENT = 'DTrek/1.0 (places catalog batch import; mzulpt@gmail.com)'

// ── Etichetta tipo MiC (testo, non URI — vedi nota di verifica in cima) → SiteType ─────────────
// Stesso approccio a sottostringa di GNA_TYPE_MAP (lib/pois/gnaSource.ts), applicato qui
// all'etichetta invece che a un codice URI perché il vocabolario dei tipi MiC non è stato
// verificabile in questa sessione.
const MIC_TYPE_MAP: [string, SiteType][] = [
  ['area archeologic', 'sito_archeologico'],
  ['scavi', 'sito_archeologico'],
  ['necropoli', 'sito_archeologico'],
  ['parco archeologic', 'sito_archeologico'],
  ['castello', 'castello'],
  ['rocca', 'castello'],
  ['fortezza', 'castello'],
  ['fortificazione', 'castello'],
  ['forte', 'castello'],
  ['abbazia', 'abbazia'],
  ['monastero', 'abbazia'],
  ['convento', 'abbazia'],
  ['eremo', 'abbazia'],
  ['chiesa', 'chiesa'],
  ['basilica', 'chiesa'],
  ['cattedrale', 'chiesa'],
  ['santuario', 'chiesa'],
  ['duomo', 'chiesa'],
  ['battistero', 'chiesa'],
  ['palazzo', 'palazzo'],
  ['villa', 'palazzo'],
  ['dimora storica', 'palazzo'],
  ['teatro', 'teatro'],
  ['anfiteatro', 'teatro'],
  ['museo', 'museo'],
  ['pinacoteca', 'museo'],
  ['galleria', 'museo'],
  ['collezione', 'museo'],
  ['monumento', 'monumento'],
  ['mausoleo', 'monumento'],
  ['obelisco', 'monumento'],
]

export function micTypeLabelToSiteType(label: string | undefined | null): SiteType {
  if (!label) return 'altro'
  const lower = label.toLowerCase()
  for (const [needle, type] of MIC_TYPE_MAP) {
    if (lower.includes(needle)) return type
  }
  return 'altro'
}

// ── Binding SPARQL grezzo → PlaceCandidate ──────────────────────────────────────────────────────
export interface MicBinding {
  id: string          // parte numerica finale dell'IRI CulturalInstituteOrSite
  name: string
  typeLabel?: string
  comune?: string
  province?: string
  region?: string
  address?: string
  lat: number
  lon: number
  website?: string
}

// Pura, testabile senza rete.
export function micBindingToPlaceCandidate(b: MicBinding): PlaceCandidate {
  return {
    name: b.name,
    metaType: 'sito',
    subtype: micTypeLabelToSiteType(b.typeLabel),
    // Nessuna descrizione testuale estesa — vedi nota licenza CC BY-SA 4.0 in cima al file.
    latitude: b.lat,
    longitude: b.lon,
    region: b.region,
    province: b.province,
    municipality: b.comune,
    address: b.address,
    website: b.website,
    source: 'mic',
    sourceId: b.id,
    sourceUrl: `http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/${b.id}`,
    rawType: b.typeLabel,
    // Non 1 come ISTAT/PTPR: la conversione tipo-testuale→SiteType qui è euristica (vedi
    // MIC_TYPE_MAP), non un campo strutturato con valori chiusi verificati.
    confidence: b.typeLabel ? 0.9 : 0.6,
    metadata: {
      micTypeLabel: b.typeLabel,
    },
  }
}

// ── SPARQL (server-side, batch — MAI per-ricerca-utente, piano §9/§21) ─────────────────────────
// Collegamento CONFERMATO su dati reali (2026-09-17, --describe su CulturalInstituteOrSite/7275 —
// Archivio di Stato di Firenze): `?cis cis:hasSite ?site` (non hasTimeIndexedTypedLocation, mai
// apparso nei dati reali). Quel record però non aveva coordinate — solo un indirizzo strutturato.
//
// Le coordinate: un SECONDO record reale (CulturalInstituteOrSite/100005, "Museo civico
// aufidenate", trovato dall'utente su LodView) le aveva sì, ma con un vocabolario DIVERSO da
// quello confermato nell'esempio ufficiale della classe Site: `geo:lat`/`geo:long` (WGS84 Basic
// Geo) direttamente sul nodo, oltre a `clvapit:hasGeometry`. Il catalogo ArCo non è uniforme —
// schede diverse, catalogate in periodi diversi, sembrano usare vocabolari diversi. La query sotto
// prova ENTRAMBI i vocabolari (`geo:lat`/`geo:long` diretto, e `clvapit:hasGeometry` →
// `clvapit:lat`/`clvapit:long`) su ENTRAMBI i punti di aggancio (CIS e Site), invece di sceglierne
// uno solo — ogni ramo è supportato da un'osservazione reale, non una nuova ipotesi.
//
// L'indirizzo (siteAddress → clvapit:fullAddress, un testo leggibile tipo "Via Roma, 1 - Firenze")
// era invece sempre presente anche sul record senza coordinate — possibile fallback futuro
// (geocodifica) per i record senza geometria, oggi scartati dal FILTER sotto: latitude/longitude
// sono NOT NULL su dtrek_places, un indirizzo da solo non basta.
function buildSparqlQuery(regionLabel?: string, limit = 5000): string {
  const regionFilter = regionLabel
    ? `FILTER(CONTAINS(LCASE(?regionLabel), LCASE("${regionLabel.replace(/"/g, '')}")))`
    : ''

  return `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX clvapit: <https://w3id.org/italia/onto/CLV/>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?cis ?name ?typeLabel ?comune ?address ?lat ?long WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       rdfs:label ?name .
  OPTIONAL { ?cis cis:hasSite ?site . }
  OPTIONAL {
    ?cis loc:hasCulturalInstituteOrSiteType ?type .
    ?type rdfs:label ?typeLabel .
  }
  OPTIONAL {
    { ?cis geo:lat ?lat ; geo:long ?long . }
    UNION
    { ?site geo:lat ?lat ; geo:long ?long . }
    UNION
    { ?cis clvapit:hasGeometry ?geom . ?geom clvapit:lat ?lat ; clvapit:long ?long . }
    UNION
    { ?site clvapit:hasGeometry ?geom . ?geom clvapit:lat ?lat ; clvapit:long ?long . }
  }
  OPTIONAL {
    ?site cis:siteAddress ?addr .
    ?addr clvapit:fullAddress ?address .
    OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
    OPTIONAL { ?addr clvapit:hasRegion ?regionRes . ?regionRes rdfs:label ?regionLabel . }
  }
  FILTER(BOUND(?lat) && BOUND(?long))
  ${regionFilter}
}
LIMIT ${limit}`
}

// dati.cultura.gov.it è un endpoint pubblico condiviso, non dedicato a questo script — visto dal
// vivo: un --describe è fallito con "ConnectTimeoutError... timeout: 10000ms" (il timeout di
// connessione di undici, più stretto dei 60s di AbortSignal sotto, che copre solo la risposta una
// volta stabilita la connessione). Stesso trattamento del retry con backoff già aggiunto a
// scripts/places/wikidata/enrich.ts dopo un problema analogo (502 lì, connect timeout qui).
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 4

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchSparqlJson(query: string): Promise<unknown> {
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
        body: `query=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(60000),
      })
    } catch (e) {
      // Errore di rete/timeout (incluso il ConnectTimeoutError visto dal vivo) — stesso
      // trattamento di uno status transitorio.
      lastError = e
      continue
    }
    if (res.ok) return res.json()
    if (!TRANSIENT_STATUS.has(res.status)) throw new Error(`MiC SPARQL ${res.status}: ${(await res.text()).slice(0, 500)}`)
    lastError = new Error(`MiC SPARQL ${res.status}`)
  }
  throw lastError instanceof Error ? lastError : new Error('MiC SPARQL: troppi tentativi falliti')
}

async function querySparql(query: string): Promise<MicBinding[]> {
  const data = await fetchSparqlJson(query) as { results: { bindings: Record<string, { value: string }>[] } }
  const out: MicBinding[] = []
  for (const row of data.results.bindings) {
    const iri = row.cis?.value
    if (!iri) continue
    const id = iri.split('/').pop()
    const lat = row.lat ? parseFloat(row.lat.value) : NaN
    const lon = row.long ? parseFloat(row.long.value) : NaN
    if (!id || Number.isNaN(lat) || Number.isNaN(lon)) continue

    out.push({
      id,
      name: row.name?.value ?? 'Luogo della cultura',
      typeLabel: row.typeLabel?.value,
      comune: row.comune?.value,
      address: row.address?.value,
      lat,
      lon,
    })
  }
  return out
}

// ── Diagnostica (--describe) ─────────────────────────────────────────────────────────────────
// Due tentativi di correggere il predicato delle coordinate (geo:lat/geo:long su ?site, poi
// clv:hasGeometry/clv:lat/clv:long su tre percorsi diversi) hanno entrambi dato 0 risultati contro
// l'endpoint reale, dedotti leggendo l'ontologia invece che i dati veri. Un primo --describe (dump
// a 2 salti da un CIS reale) ha rivelato il collegamento VERO: `cis:hasSite` (semplice, diretto —
// non loc:hasTimeIndexedTypedLocation/atSite come assunto in entrambi i tentativi precedenti), su
// un nodo reale `Site/Sede_di_7275`. Quel primo dump si è fermato un salto troppo presto per vedere
// COSA c'è dentro quel Site — questa seconda query segue `cis:hasSite` e dumpa le proprietà dirette
// del Site (più un salto in più, nel caso le coordinate siano un ulteriore livello sotto, es. via
// un nodo Address/Geometry) — dovrebbe rivelare direttamente il predicato delle coordinate.
const DESCRIBE_QUERY = `
PREFIX cis: <http://dati.beniculturali.it/cis/>
SELECT ?cis ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?cis WHERE { ?cis a cis:CulturalInstituteOrSite . } LIMIT 1 }
  ?cis ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`

const DESCRIBE_SITE_QUERY = `
PREFIX cis: <http://dati.beniculturali.it/cis/>
SELECT ?cis ?site ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?cis WHERE { ?cis a cis:CulturalInstituteOrSite . } LIMIT 1 }
  ?cis cis:hasSite ?site .
  ?site ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`

async function runSparqlDiagnostic(label: string, query: string): Promise<void> {
  console.log(`Interrogo ${SPARQL_ENDPOINT} — ${label}…`)
  const data = await fetchSparqlJson(query)
  console.log(JSON.stringify(data, null, 2))
}

async function runDescribe(): Promise<void> {
  await runSparqlDiagnostic('struttura reale di un CulturalInstituteOrSite', DESCRIBE_QUERY)
  await runSparqlDiagnostic('proprietà dirette del suo Site (via cis:hasSite)', DESCRIBE_SITE_QUERY)
}

async function main() {
  if (process.argv.includes('--describe')) {
    await runDescribe()
    return
  }

  const DRY_RUN = process.argv.includes('--dry-run')
  const regionIdx = process.argv.indexOf('--region')
  const region = regionIdx !== -1 ? process.argv[regionIdx + 1] : 'Lazio'
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : 5000

  console.log(`Interrogo ${SPARQL_ENDPOINT} (regione: ${region || 'tutte'}, limit ${limit})…`)
  const bindings = await querySparql(buildSparqlQuery(region || undefined, limit))
  console.log(`${bindings.length} risultati con coordinate valide.`)
  const candidates = bindings.map(micBindingToPlaceCandidate)

  if (DRY_RUN) {
    console.log('[DRY RUN] Esempio candidato:', JSON.stringify(candidates[0], null, 2))
    console.log(`[DRY RUN] ${candidates.length} candidati pronti, nessuna scrittura.`)
    return
  }

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars, oppure usa --dry-run.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const stats = await importPlaceCandidates(supabase, candidates)
  console.log(JSON.stringify(stats, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('fetch.ts') && process.argv[1]?.includes('mic')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
