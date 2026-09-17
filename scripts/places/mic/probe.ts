/**
 * MiC (Ministero della Cultura) — probe diagnostico dell'endpoint SPARQL ArCo
 *
 * Bisect mirato (piano `docs/piano-mete-multitipologia.md` §8): la query di produzione in
 * `fetch.ts` (NON toccata da questo script) ha dato `DOMException [TimeoutError]` anche con
 * `--limit` piccoli. Prima di un'altra riscrittura della query di produzione, questo script isola
 * QUALE singolo predicato/join è costoso per il motore — uno alla volta, con query minime
 * (`LIMIT 5`, nessuna combinazione tra loro) — invece di continuare a modificare `fetch.ts` alla
 * cieca.
 *
 * Ogni probe usa SOLO strutture RDF già verificate leggendo dati reali con
 * `fetch.ts --describe` sul record `CulturalInstituteOrSite/7275` (vedi `README.md` di questa
 * cartella), tranne il probe `cis:hasAddress`: incluso apposta per VERIFICARE (falsificare o
 * confermare con un dato reale) un predicato suggerito da una fonte esterna basata sulla sola
 * documentazione dell'ontologia CulturalON, mai osservato nei dati reali finora — stesso errore
 * già fatto due volte con le coordinate prima di usare `--describe`.
 *
 * Nessuna scrittura, nessun Supabase, nessuna retry — un solo tentativo per probe, per avere un
 * segnale onesto (non smussato da un retry) su quale query è lenta o va in timeout.
 *
 * Usage:
 *   npx tsx scripts/places/mic/probe.ts [--timeout 30000] [--only "cis:hasSite"]
 */

const SPARQL_ENDPOINT = 'https://dati.cultura.gov.it/sparql'
const USER_AGENT = 'DTrek/1.0 (places catalog diagnostics; mzulpt@gmail.com)'
const DEFAULT_TIMEOUT_MS = 30000
const PROBE_LIMIT = 5

export interface Probe {
  name: string
  note: string
  query: string
}

const PREFIXES = `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX clvapit: <https://w3id.org/italia/onto/CLV/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
`

export const PROBES: Probe[] = [
  {
    name: 'baseline-type',
    note: 'Solo la tripla di tipo, nessun join — tempo di riferimento del motore su questa classe.',
    query: `${PREFIXES}
SELECT ?cis WHERE {
  ?cis a cis:CulturalInstituteOrSite .
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    name: 'cis:hasSite',
    note: 'Verificato con --describe su CulturalInstituteOrSite/7275: collegamento diretto CIS → Site.',
    query: `${PREFIXES}
SELECT ?cis ?site WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       cis:hasSite ?site .
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    name: 'cis:siteAddress+clvapit:fullAddress',
    note: 'Verificato con --describe: Site → Address (cis:siteAddress) → testo indirizzo (clvapit:fullAddress).',
    query: `${PREFIXES}
SELECT ?cis ?address WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       cis:hasSite ?site .
  ?site cis:siteAddress ?addr .
  ?addr clvapit:fullAddress ?address .
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    name: 'clvapit:hasRegion',
    note: 'Verificato con --describe: Address → Region (clvapit:hasRegion) → rdfs:label.',
    query: `${PREFIXES}
SELECT ?cis ?regionLabel WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       cis:hasSite ?site .
  ?site cis:siteAddress ?addr .
  ?addr clvapit:hasRegion ?regionRes .
  ?regionRes rdfs:label ?regionLabel .
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    name: 'clvapit:hasGeometry+lat/long',
    note: "Verificato sul commento della classe Site restituito dall'endpoint stesso (esempio ufficiale) — non osservato popolato sul record 7275 specifico (indirizzo presente, coordinate no).",
    query: `${PREFIXES}
SELECT ?cis ?lat ?long WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       cis:hasSite ?site .
  ?site clvapit:hasGeometry ?geom .
  ?geom clvapit:lat ?lat ;
        clvapit:long ?long .
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    name: 'cis:hasAddress (NON verificato)',
    note: 'Predicato suggerito da fonte esterna (documentazione ontologia CulturalON), mai osservato nei dati reali con --describe. Questo probe esiste per FALSIFICARLO o confermarlo con un dato vero, non per adottarlo in fetch.ts prima di saperlo.',
    query: `${PREFIXES}
SELECT ?cis ?addr WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       cis:hasAddress ?addr .
} LIMIT ${PROBE_LIMIT}`,
  },
  // ── Round 2 (2026-09-17): ogni predicato singolarmente è rapido (<1.1s, tutti 200) — quindi il
  // timeout della query di produzione non viene da un predicato lento, ma dalla COMBINAZIONE. I
  // probe sotto ricostruiscono fetch.ts a pezzi crescenti (stessa struttura, stesso filtro regione
  // via CONTAINS/LCASE non indicizzabile) per isolare dove scatta il collasso — non un'altra
  // ipotesi, ma bisezione della query reale.
  {
    name: 'combo-candidati-lazio',
    note: "Sotto-query dei candidati di fetch.ts, esatta: name+site+address+comune, tutti OPTIONAL, filtro regione CONTAINS/LCASE('Lazio'). Isola il costo del filtro regione non indicizzabile combinato con i join OPTIONAL.",
    query: `${PREFIXES}
SELECT ?cis ?name ?site ?address ?comune WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       rdfs:label ?name .
  OPTIONAL { ?cis cis:hasSite ?site . }
  OPTIONAL {
    ?site cis:siteAddress ?addr .
    ?addr clvapit:fullAddress ?address .
    OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
    OPTIONAL { ?addr clvapit:hasRegion ?regionRes . ?regionRes rdfs:label ?regionLabel . }
  }
  FILTER(CONTAINS(LCASE(?regionLabel), LCASE("Lazio")))
} LIMIT 20`,
  },
  {
    name: 'combo-candidati+tipo',
    note: 'Come sopra + OPTIONAL sul tipo (loc:hasCulturalInstituteOrSiteType + label) — isola il costo di aggiungere un quinto OPTIONAL indipendente.',
    query: `${PREFIXES}
PREFIX loc: <https://w3id.org/arco/ontology/location/>
SELECT ?cis ?name ?site ?address ?comune ?typeLabel WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       rdfs:label ?name .
  OPTIONAL { ?cis cis:hasSite ?site . }
  OPTIONAL {
    ?site cis:siteAddress ?addr .
    ?addr clvapit:fullAddress ?address .
    OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
    OPTIONAL { ?addr clvapit:hasRegion ?regionRes . ?regionRes rdfs:label ?regionLabel . }
  }
  OPTIONAL {
    ?cis loc:hasCulturalInstituteOrSiteType ?type .
    ?type rdfs:label ?typeLabel .
  }
  FILTER(CONTAINS(LCASE(?regionLabel), LCASE("Lazio")))
} LIMIT 20`,
  },
  {
    name: 'combo-produzione-completa',
    note: 'Ricostruzione fedele della query intera di fetch.ts (4 OPTIONAL coordinate indipendenti + COALESCE + DISTINCT + FILTER BOUND), stesso filtro regione, LIMIT piccolo. Se questa va in timeout ma i pezzi sopra no, il collasso è nella combinazione DISTINCT+4 OPTIONAL geometria, non nel filtro regione da solo.',
    query: `${PREFIXES}
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
SELECT DISTINCT ?cis ?name ?typeLabel ?comune ?address ?lat ?long WHERE {
  {
    SELECT ?cis ?name ?site ?address ?comune WHERE {
      ?cis a cis:CulturalInstituteOrSite ;
           rdfs:label ?name .
      OPTIONAL { ?cis cis:hasSite ?site . }
      OPTIONAL {
        ?site cis:siteAddress ?addr .
        ?addr clvapit:fullAddress ?address .
        OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
        OPTIONAL { ?addr clvapit:hasRegion ?regionRes . ?regionRes rdfs:label ?regionLabel . }
      }
      FILTER(CONTAINS(LCASE(?regionLabel), LCASE("Lazio")))
    }
    LIMIT 20
  }
  OPTIONAL {
    ?cis loc:hasCulturalInstituteOrSiteType ?type .
    ?type rdfs:label ?typeLabel .
  }
  OPTIONAL { ?cis geo:lat ?lat1 ; geo:long ?long1 . }
  OPTIONAL { ?site geo:lat ?lat2 ; geo:long ?long2 . }
  OPTIONAL { ?cis clvapit:hasGeometry ?geomA . ?geomA clvapit:lat ?lat3 ; clvapit:long ?long3 . }
  OPTIONAL { ?site clvapit:hasGeometry ?geomB . ?geomB clvapit:lat ?lat4 ; clvapit:long ?long4 . }
  BIND(COALESCE(?lat1, ?lat2, ?lat3, ?lat4) AS ?lat)
  BIND(COALESCE(?long1, ?long2, ?long3, ?long4) AS ?long)
  FILTER(BOUND(?lat) && BOUND(?long))
} LIMIT ${PROBE_LIMIT}`,
  },
  // ── Round 3 (2026-09-17): round 2 ha isolato la causa con un dato certo, non un'ipotesi —
  // Virtuoso rifiuta 'combo-candidati-lazio'/'combo-candidati+tipo' in 117-118ms con un errore del
  // PIANIFICATORE ("estimated execution time ... exceeds the limit"), non un timeout dopo
  // esecuzione lenta. Il filtro regione CONTAINS(LCASE(?regionLabel), ...) dopo due OPTIONAL
  // (siteAddress→hasRegion) non è indicizzabile — è quello che fa esplodere la stima. Ogni singolo
  // pezzo preso da solo (incluso clvapit:hasRegion SENZA filtro, round 1) è invece rapido. Questi
  // due probe verificano il fix più diretto: togliere il filtro server-side (candidato per un
  // filtro lato client in fetch.ts) o sostituire CONTAINS/LCASE con un'uguaglianza esatta.
  {
    name: 'combo-candidati-senza-filtro-regione',
    note: 'Identica a combo-candidati-lazio MA senza il FILTER regione — regionLabel resta come colonna in output, da filtrare lato client. Se questa passa, il fix è spostare il filtro regione in fetch.ts invece che in SPARQL.',
    query: `${PREFIXES}
SELECT ?cis ?name ?site ?address ?comune ?regionLabel WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       rdfs:label ?name .
  OPTIONAL { ?cis cis:hasSite ?site . }
  OPTIONAL {
    ?site cis:siteAddress ?addr .
    ?addr clvapit:fullAddress ?address .
    OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
    OPTIONAL { ?addr clvapit:hasRegion ?regionRes . ?regionRes rdfs:label ?regionLabel . }
  }
} LIMIT 20`,
  },
  {
    name: 'combo-candidati-uguaglianza-regione',
    note: "Identica a combo-candidati-lazio ma con FILTER(?regionLabel = \"Lazio\") (uguaglianza esatta) invece di CONTAINS/LCASE — verifica se è la non-indicizzabilità di CONTAINS/LCASE specificamente a far esplodere la stima, o qualunque FILTER a quel punto della query.",
    query: `${PREFIXES}
SELECT ?cis ?name ?site ?address ?comune WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       rdfs:label ?name .
  OPTIONAL { ?cis cis:hasSite ?site . }
  OPTIONAL {
    ?site cis:siteAddress ?addr .
    ?addr clvapit:fullAddress ?address .
    OPTIONAL { ?addr clvapit:hasCity ?comuneRes . ?comuneRes rdfs:label ?comune . }
    OPTIONAL { ?addr clvapit:hasRegion ?regionRes . ?regionRes rdfs:label ?regionLabel . }
  }
  FILTER(?regionLabel = "Lazio")
} LIMIT 20`,
  },
]

export interface ProbeResult {
  name: string
  note: string
  httpStatus: number | 'TIMEOUT' | 'ERROR'
  durationMs: number
  resultCount: number | null
  sample: unknown
  error: string | null
}

async function runProbe(probe: Probe, timeoutMs: number): Promise<ProbeResult> {
  const start = Date.now()
  try {
    const res = await fetch(SPARQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/sparql-results+json',
        'User-Agent': USER_AGENT,
      },
      body: `query=${encodeURIComponent(probe.query)}`,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const durationMs = Date.now() - start
    if (!res.ok) {
      return {
        name: probe.name,
        note: probe.note,
        httpStatus: res.status,
        durationMs,
        resultCount: null,
        sample: null,
        error: (await res.text()).slice(0, 300),
      }
    }
    const data = await res.json() as { results?: { bindings?: Record<string, { value: string }>[] } }
    const bindings = data.results?.bindings ?? []
    return {
      name: probe.name,
      note: probe.note,
      httpStatus: res.status,
      durationMs,
      resultCount: bindings.length,
      sample: bindings[0] ?? null,
      error: null,
    }
  } catch (e) {
    const durationMs = Date.now() - start
    const isTimeout = e instanceof DOMException && e.name === 'TimeoutError'
    return {
      name: probe.name,
      note: probe.note,
      httpStatus: isTimeout ? 'TIMEOUT' : 'ERROR',
      durationMs,
      resultCount: null,
      sample: null,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function main() {
  const timeoutIdx = process.argv.indexOf('--timeout')
  const timeoutMs = timeoutIdx !== -1 ? parseInt(process.argv[timeoutIdx + 1], 10) : DEFAULT_TIMEOUT_MS
  const onlyIdx = process.argv.indexOf('--only')
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : undefined

  const probes = only ? PROBES.filter(p => p.name === only) : PROBES
  if (only && probes.length === 0) {
    console.error(`Nessun probe con nome "${only}". Disponibili: ${PROBES.map(p => p.name).join(', ')}`)
    process.exit(1)
  }

  // Sequenziale, non in parallelo: l'endpoint è pubblico e condiviso (non dedicato a questo
  // script, stessa nota già in fetch.ts) — probe in parallelo sommerebbero carico e renderebbero
  // il segnale su QUALE probe è lento inaffidabile.
  console.log(`Interrogo ${SPARQL_ENDPOINT} — ${probes.length} probe, timeout ${timeoutMs}ms ciascuno, in sequenza, un solo tentativo per probe (nessuna retry, per un segnale non smussato).\n`)

  const results: ProbeResult[] = []
  for (const probe of probes) {
    process.stdout.write(`→ ${probe.name}... `)
    const result = await runProbe(probe, timeoutMs)
    results.push(result)
    const errorSuffix = result.error ? ` — ERRORE: ${result.error.slice(0, 120)}` : ''
    console.log(`${result.httpStatus} in ${result.durationMs}ms — ${result.resultCount ?? 0} risultati${errorSuffix}`)
  }

  console.log('\n--- Risultato completo (JSON) ---')
  console.log(JSON.stringify(results, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('probe.ts') && process.argv[1]?.includes('mic')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
