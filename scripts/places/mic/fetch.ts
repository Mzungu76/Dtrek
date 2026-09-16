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
 * ── Coordinate: predicato corretto (era sbagliato, vedi nota) ──────────────────────────────────
 * Il primo dry-run reale contro l'endpoint (--limit 20, regione Lazio) ha dato 0 risultati con
 * coordinate valide: la query usava `geo:lat`/`geo:long` (WGS84 Basic Geo Vocabulary) direttamente
 * su `?site`, un'ipotesi mai verificata contro l'endpoint reale (vedi git history di questo file).
 * Predicati REALI, verificati leggendo i file OWL/RDF pubblicati — non un blog di terzi:
 *   - `location.owl` (https://raw.githubusercontent.com/ICCD-MiBACT/ArCo/master/ArCo-release/ontologie/location/location.owl):
 *     `loc:hasCoordinates` collega una `clv:Geometry` alla sua `loc:Coordinates` — ma i valori
 *     numerici non sono su `loc:Coordinates`, sono proprietà della `clv:Geometry` stessa.
 *   - `CLV-AP_IT.rdf`, l'ontologia AgID importata da ArCo per Geometry/Address
 *     (https://raw.githubusercontent.com/italia/daf-ontologie-vocabolari-controllati/master/Ontologie/CLV/latest/CLV-AP_IT.rdf):
 *     `clv:lat`/`clv:long` (`https://w3id.org/italia/onto/CLV/{lat,long}`) sono proprietà
 *     dirette della classe `clv:Geometry`; `clv:hasGeometry` (domain `owl:Thing`, quindi
 *     utilizzabile su qualunque risorsa) collega una cosa alla sua Geometry.
 * Non essendo noto CON CERTEZZA se `clv:hasGeometry` sia attaccato al CIS stesso, al `Site`
 * (via `atSite`) o al `Feature` dell'indirizzo (via `atLocation`) — il dominio `owl:Thing` lo rende
 * plausibile ovunque — la query prova tutti e tre i percorsi con un path SPARQL `|` (alternation),
 * prendendo il primo che effettivamente bind. Ancora da confermare con un nuovo --limit piccolo
 * contro l'endpoint reale (solo il runner GitHub Actions ci arriva, non questa sandbox né la
 * precedente — vedi `scripts/places/mic/README.md`) prima di alzare il limite.
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
// Coordinate: clv:lat/clv:long sono proprietà dirette di una clv:Geometry (non geo:lat/geo:long su
// ?site, che ha dato 0 risultati nel primo dry-run reale — vedi nota in cima al file). clv:hasGeometry
// ha domain owl:Thing, quindi non è certo se sia attaccata al CIS, al Site o al Feature indirizzo:
// il path `|` sotto prova tutti e tre, prendendo il primo che bind. Ancora da confermare con un
// --limit piccolo contro l'endpoint reale prima di alzarlo.
function buildSparqlQuery(regionLabel?: string, limit = 5000): string {
  const regionFilter = regionLabel
    ? `FILTER(CONTAINS(LCASE(?regionLabel), LCASE("${regionLabel.replace(/"/g, '')}")))`
    : ''

  return `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX clvapit: <https://w3id.org/italia/onto/CLV/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?cis ?name ?typeLabel ?comune ?address ?lat ?long WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       rdfs:label ?name .
  OPTIONAL {
    ?cis loc:hasCulturalInstituteOrSiteType ?type .
    ?type rdfs:label ?typeLabel .
  }
  OPTIONAL {
    ?cis (clvapit:hasGeometry
         | loc:hasTimeIndexedTypedLocation/loc:atSite/clvapit:hasGeometry
         | loc:hasTimeIndexedTypedLocation/loc:atLocation/clvapit:hasGeometry) ?geom .
    ?geom clvapit:lat ?lat ; clvapit:long ?long .
  }
  OPTIONAL {
    ?cis loc:hasTimeIndexedTypedLocation/loc:atLocation ?feature .
    ?feature clvapit:hasAddress ?addr .
    ?addr rdfs:label ?address .
    OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
  }
  FILTER(BOUND(?lat) && BOUND(?long))
  ${regionFilter}
}
LIMIT ${limit}`
}

async function querySparql(query: string): Promise<MicBinding[]> {
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
    body: `query=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`MiC SPARQL ${res.status}: ${(await res.text()).slice(0, 500)}`)

  const data: { results: { bindings: Record<string, { value: string }>[] } } = await res.json()
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

async function main() {
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
