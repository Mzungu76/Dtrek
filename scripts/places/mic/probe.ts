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
  // ── Round 4 (2026-09-17): bug segnalato dal vivo — "Regione: tutta Italia, Limit: 10000" ha dato
  // 0 risultati (nessun errore HTTP). Causa trovata leggendo la query di produzione, non un'ipotesi
  // nuova: senza filtro regione, il vecchio CANDIDATE_POOL_CAP troncava a un campione ARBITRARIO di
  // 2000 candidati PRIMA del filtro coordinate — con una copertura bassa e non uniforme delle
  // coordinate nel catalogo, quella fetta poteva contenere zero record georeferenziati. Fix
  // applicato in fetch.ts: il filtro coordinate entra ora nella stessa sotto-query del filtro
  // regione, prima del LIMIT (che diventa `limit` diretto, niente più pool separato). Questo probe
  // riproduce ESATTAMENTE la nuova forma per il caso "tutta Italia" (nessun filtro regione) con un
  // LIMIT piccolo — verifica a basso costo, prima di un write con limit alto, se il motore riesce a
  // trovare record georeferenziati scandendo il catalogo intero senza un filtro regione a restringere
  // subito lo spazio di ricerca (rischio non ancora verificato dal vivo, annotato in fetch.ts).
  {
    name: 'tutta-italia-con-coordinate',
    note: 'Forma nuova (round 4) della sotto-query di produzione senza filtro regione: filtro coordinate spostato dentro la sotto-query, prima del suo LIMIT, invece di un pool arbitrario filtrato dopo. Verifica se il motore trova record georeferenziati su tutto il catalogo entro un timeout ragionevole.',
    query: `${PREFIXES}
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
SELECT ?cis ?name ?lat ?long WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       rdfs:label ?name .
  OPTIONAL { ?cis cis:hasSite ?site . }
  OPTIONAL { ?cis geo:lat ?lat1 ; geo:long ?long1 . }
  OPTIONAL { ?site geo:lat ?lat2 ; geo:long ?long2 . }
  OPTIONAL { ?cis clvapit:hasGeometry ?geomA . ?geomA clvapit:lat ?lat3 ; clvapit:long ?long3 . }
  OPTIONAL { ?site clvapit:hasGeometry ?geomB . ?geomB clvapit:lat ?lat4 ; clvapit:long ?long4 . }
  BIND(COALESCE(?lat1, ?lat2, ?lat3, ?lat4) AS ?lat)
  BIND(COALESCE(?long1, ?long2, ?long3, ?long4) AS ?long)
  FILTER(BOUND(?lat) && BOUND(?long))
} LIMIT 20`,
  },
  // ── Round 5 (2026-09-17): il probe sopra ('tutta-italia-con-coordinate') girato dal vivo in
  // `write` con --limit 10000 ha dato `MiC SPARQL 500` dopo tutti i retry — coerente con l'ipotesi
  // scritta nella sua nota (scandire l'intero catalogo senza filtro regione è troppo costoso).
  // fetch.ts non tenta più una query "tutta Italia" senza filtro: interroga una regione alla volta,
  // usando le etichette REALI presenti nel grafo invece di una lista di nomi indovinata. Questo probe
  // verifica solo la query di scoperta delle regioni (`REGION_LIST_QUERY` in fetch.ts) — stesso
  // predicato di 'clvapit:hasRegion' (già provato veloce senza filtro, round 1), qui con DISTINCT al
  // posto di un LIMIT piccolo per elenco completo.
  {
    name: 'lista-regioni',
    note: 'Query di scoperta regioni usata da fetch.ts per "tutta Italia" (round 5) — stesso predicato clvapit:hasRegion già provato veloce (round 1), qui con DISTINCT per ottenere la lista completa delle etichette regione realmente presenti nel grafo, mai una lista indovinata.',
    query: `${PREFIXES}
SELECT DISTINCT ?regionLabel WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       cis:hasSite ?site .
  ?site cis:siteAddress ?addr .
  ?addr clvapit:hasRegion ?regionRes .
  ?regionRes rdfs:label ?regionLabel .
} LIMIT 100`,
  },
  // ── Round 6 (2026-09-17): la struttura del round 4 (coordinate DENTRO la sotto-query filtrata per
  // regione) ha dato lo stesso tipo di rifiuto del pianificatore del round 3, ma su TUTTE le 8
  // regioni provate dal vivo (etichette reali, whitelisted, non un valore sporco) — con lo STESSO
  // numero di stima negativo per ognuna, il che esclude un problema di cardinalità di un valore
  // specifico e punta alla forma della query. Poiché "tutta Italia" ora passa sempre da
  // fetchAllRegions (mai più buildSparqlQuery senza un regionLabel reale), si può tornare alla
  // struttura del round 3 — GIÀ VERIFICATA con una scrittura reale riuscita (495 record importati in
  // Lazio, confermati in Supabase): coordinate nella query ESTERNA, fuori dalla sotto-query regione.
  // Questo probe la testa di nuovo, isolata, prima di un altro `write`.
  {
    name: 'produzione-round6-coordinate-esterne',
    note: 'Struttura ripristinata al round 3 (coordinate fuori dalla sotto-query regione, con pool candidati scalato) applicata a una regione reale (Lazio) — la stessa che aveva già dato 495 risultati validi in scrittura, prima che il round 4 spostasse le coordinate dentro la sotto-query e rompesse anche il caso per-regione (round 6).',
    query: `${PREFIXES}
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
SELECT DISTINCT ?cis ?name ?typeLabel ?comune ?regionLabel ?address ?lat ?long WHERE {
  {
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
      FILTER(?regionLabel = "Lazio")
    }
    LIMIT 80
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
  // ── Round 7 (2026-09-21): `--describe --name Canepina` (MIC_DATA_SOURCES.md §3bis, lanciato
  // manualmente dall'utente contro l'endpoint reale) ha rivelato 6 predicati MAI interrogati da
  // `fetch.ts` — descrizione (`l0:description`), tipologia via letterale diretto (`dc:type`,
  // presente quando `loc:hasCulturalInstituteOrSiteType` non lo è), orari/prenotazione
  // (`ac:hasAccessCondition`), contatti (`sm:hasOnlineContactPoint`), biglietto (`pot:hasTicket`),
  // immagine (`foaf:depiction`) — tutti confermati REALI, ma su un solo record (105665). Prima di
  // cablarli nella query di produzione per tutta Italia serve sapere se sono un caso isolato di
  // quel record o generalizzabili — questo probe conta, su un campione fisso (nessun filtro
  // regione: la tripla di tipo da sola è già verificata veloce senza filtro, round 1), quanti CIS
  // hanno ciascun predicato. Sei `OPTIONAL` indipendenti in cima allo scope (mai annidati, mai
  // combinati con `UNION` o un `FILTER` su stringa) — la stessa forma già verificata sicura per le
  // coordinate (round 6) — non la combinazione OPTIONAL+UNION o CONTAINS/LCASE che ha fatto
  // esplodere lo stimatore ai round 2/3.
  {
    name: 'copertura-campi-arricchenti',
    note: 'Conta, su un campione di 300 CulturalInstituteOrSite (nessun filtro), quanti hanno ciascuno dei 6 predicati trovati su Canepina/105665 — verifica se generalizzano prima di estendere fetch.ts.',
    query: `${PREFIXES}
PREFIX l0: <https://w3id.org/italia/onto/l0/>
PREFIX ac: <https://w3id.org/italia/onto/AccessCondition/>
PREFIX sm: <https://w3id.org/italia/onto/SM/>
PREFIX pot: <https://w3id.org/italia/onto/POT/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT (COUNT(*) AS ?campione)
       (COUNT(?desc) AS ?conDescrizione)
       (COUNT(?dctype) AS ?conDcType)
       (COUNT(?access) AS ?conAccessCondition)
       (COUNT(?contact) AS ?conContatti)
       (COUNT(?ticket) AS ?conTicket)
       (COUNT(?img) AS ?conImmagine)
WHERE {
  { SELECT ?cis WHERE { ?cis a cis:CulturalInstituteOrSite . } LIMIT 300 }
  OPTIONAL { ?cis l0:description ?desc . }
  OPTIONAL { ?cis dc:type ?dctype . }
  OPTIONAL { ?cis ac:hasAccessCondition ?access . }
  OPTIONAL { ?cis sm:hasOnlineContactPoint ?contact . }
  OPTIONAL { ?cis pot:hasTicket ?ticket . }
  OPTIONAL { ?cis foaf:depiction ?img . }
}`,
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
