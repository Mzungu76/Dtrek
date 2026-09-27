/**
 * MiC/ArCo — probe diagnostico per "Opere di questo museo" (opere/beni conservati in un
 * CulturalInstituteOrSite già importato in Dtrek da `scripts/places/mic/fetch.ts`).
 *
 * Vedi `README.md` in questa cartella e `docs/arco-opere-musei.md` per il contesto completo
 * (perché serve, cosa esiste già, cosa NON è ancora verificato). In breve: `guideProfiles.ts`
 * genera oggi la sezione "opere" della Guida Sito museo come testo LLM libero, senza alcun dato
 * reale — questo script verifica SE e COME ArCo collega un'opera catalogata al museo che la
 * conserva, per poter un giorno sostituire/arricchire quel testo con dati veri.
 *
 * **Nessuna riga di questo file è stata eseguita contro l'endpoint reale in questa sessione**
 * (stesso blocco di rete verso `dati.cultura.gov.it` già documentato in `scripts/places/mic/`,
 * riverificato oggi — vedi docs/arco-opere-musei.md §0). Tutti i predicati sotto sono letti
 * DIRETTAMENTE dai file ontologia reali su GitHub (citati inline), non indovinati — ma "letto
 * nell'ontologia" non è "verificato sui dati": lo stesso repository ha già trovato più volte un
 * predicato plausibile dalla sola documentazione che dava 0 risultati veri (vedi
 * `scripts/places/mic/README.md`, coordinate). Questo file esiste per chiudere quella distanza
 * PRIMA di scrivere qualunque pipeline di import — nessuna scrittura, nessun Supabase, nessuna
 * classe/predicato qui viene mai usato altrove finché un probe non lo conferma.
 *
 * ── Cosa è confermato leggendo l'ontologia (non ancora sui dati) ────────────────────────────────
 * - Classe `https://w3id.org/arco/ontology/arco/CulturalProperty` (modulo "arco" — un'opera/bene
 *   catalogato), da
 *   https://raw.githubusercontent.com/ICCD-MiBACT/ArCo/master/ArCo-release/ontologie/arco/arco.owl
 * - Proprietà `https://w3id.org/arco/ontology/location/hasCulturalInstituteOrSite` (modulo
 *   "location" — LO STESSO modulo che espone `hasCulturalInstituteOrSiteType` e
 *   `hasTimeIndexedTypedLocation` già usati da `scripts/places/mic/fetch.ts`), da
 *   https://raw.githubusercontent.com/ICCD-MiBACT/ArCo/master/ArCo-release/ontologie/location/location.owl
 *   — domain `owl:Thing`, range `http://dati.beniculturali.it/cis/CulturalInstituteOrSite`,
 *   rdfs:comment: "This property links a cultural property to the cultural institute or site."
 *   Il commento implica un'opera (soggetto) → museo (oggetto), MAI osservato su un dato reale.
 *
 * ── Perché anche un probe con la reverse, non solo la forward ───────────────────────────────────
 * `scripts/places/mic/fetch.ts` ha già un precedente diretto: la documentazione suggeriva
 * `hasTimeIndexedTypedLocation`→`atSite` per collegare un CIS al suo Site, ma `--describe` su un
 * record vero ha rivelato `cis:hasSite` (un predicato diverso, non solo una direzione diversa).
 * Qui il predicato è quello giusto SOLO se esiste anche sui dati — e "domain owl:Thing" è talmente
 * generico che non garantisce nulla sull'uso reale. `hasCulturalInstituteOrSite-reverse` sotto
 * esiste per non ripetere lo stesso errore due volte.
 *
 * Usage (diagnostica, nessun Supabase):
 *   npx tsx scripts/places/mic/opere/probe.ts                       # tutti i probe generici
 *   npx tsx scripts/places/mic/opere/probe.ts --only "baseline-culturalproperty"
 *   npx tsx scripts/places/mic/opere/probe.ts --cis 105665           # opere collegate a QUESTO museo (id ArCo già in dtrek_places.source_id per source='mic')
 *   npx tsx scripts/places/mic/opere/probe.ts --describe             # dump 2 salti di una CulturalProperty arbitraria
 *   npx tsx scripts/places/mic/opere/probe.ts --describe --name "Nettuno"
 *   npx tsx scripts/places/mic/opere/probe.ts --describe --cis 105665  # dump 2 salti della prima opera collegata a QUESTO museo
 *   npx tsx scripts/places/mic/opere/probe.ts --coverage [--limit 500]  # distribuzione per famiglia di URI museo su un campione
 *   npx tsx scripts/places/mic/opere/probe.ts --describe-uri "https://w3id.org/arco/resource/CulturalInstituteOrSite/<hash>"  # dump 2 salti di un URI qualunque (es. un museo della famiglia "hash" trovata da --coverage)
 *   npx tsx scripts/places/mic/opere/probe.ts --museo-opere "https://w3id.org/arco/resource/CulturalInstituteOrSite/<hash>"  # conteggio + campione via loc:isCulturalInstituteOrSiteOf (predicato forward museo→opera, trovato con --describe-uri)
 *
 * `--describe`/`--describe-uri` stampano ora un formato compatto (predicato = valore, con gli URI
 * accorciati al nome locale, righe deduplicate) invece del JSON grezzo — troppo grande da incollare
 * da Termux su un dump con molte proprietà. Aggiungere `--grep "<termine>"` per filtrare solo le
 * righe che contengono quel testo (es. `--grep sameAs`, `--grep label`) prima di stampare.
 */

const SPARQL_ENDPOINT = 'https://dati.cultura.gov.it/sparql'
const USER_AGENT = 'DTrek/1.0 (places catalog diagnostics; mzulpt@gmail.com)'
const DEFAULT_TIMEOUT_MS = 30000
const PROBE_LIMIT = 5

// Stessa base URI già usata (e verificata in produzione, sourceUrl reale) da
// scripts/places/mic/fetch.ts per un CulturalInstituteOrSite — mai una nuova base indovinata.
const CIS_RESOURCE_BASE = 'http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/'

const PREFIXES = `
PREFIX arco: <https://w3id.org/arco/ontology/arco/>
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
`

export interface Probe {
  name: string
  note: string
  query: string
}

export const PROBES: Probe[] = [
  {
    name: 'baseline-culturalproperty',
    note: 'Solo la tripla di tipo arco:CulturalProperty, nessun join — verifica che la classe abbia istanze reali raggiungibili da questo endpoint (letta da arco.owl su GitHub, mai interrogata prima).',
    query: `${PREFIXES}
SELECT ?opera WHERE {
  ?opera a arco:CulturalProperty .
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    name: 'hasCulturalInstituteOrSite-forward (NON verificato)',
    note: "Predicato letto da location.owl (domain owl:Thing, range cis:CulturalInstituteOrSite, commento: \"links a cultural property to the cultural institute or site\") — direzione opera→museo assunta dal commento, mai osservata sui dati reali.",
    query: `${PREFIXES}
SELECT ?opera ?cis WHERE {
  ?opera loc:hasCulturalInstituteOrSite ?cis .
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    // FIX (2026-09-27, probe eseguito dal vivo dall'utente via Termux): la prima versione di
    // questo probe si limitava a rinominare le variabili (?cis/?opera) della stessa identica forma
    // di tripla — non testava davvero una direzione diversa (in SPARQL `?a p ?b` e `?b p ?a` con
    // nomi di variabile scambiati restituiscono la STESSA tripla reale nella stessa posizione
    // soggetto/oggetto, verificato: entrambe le versioni hanno dato gli stessi URI nella stessa
    // posizione). Questo probe testa una domanda genuinamente diversa: un CulturalInstituteOrSite
    // (soggetto tipizzato) compare mai come SOGGETTO di questo predicato? Se la direzione è univoca
    // opera→museo (confermata dal probe forward sui dati reali), questo deve dare 0 risultati.
    name: 'hasCulturalInstituteOrSite-cis-come-soggetto (NON verificato)',
    note: 'Verifica se un CulturalInstituteOrSite reale compare MAI come soggetto (non oggetto) di questo predicato — se la direzione osservata (opera→museo) è univoca, atteso 0 risultati.',
    query: `${PREFIXES}
SELECT ?cis ?other WHERE {
  ?cis a cis:CulturalInstituteOrSite ;
       loc:hasCulturalInstituteOrSite ?other .
} LIMIT ${PROBE_LIMIT}`,
  },
  // FIX (2026-09-27, probe --cis 105665 eseguito dal vivo dall'utente su Canepina — 0 risultati).
  // Inconclusivo da solo: Canepina è un piccolo ecomuseo, plausibile che non abbia opere
  // catalogate singolarmente, ma anche compatibile con l'ipotesi (già sollevata sopra per
  // Alto Adige) che gli URI museo raggiunti da hasCulturalInstituteOrSite vivano SOLO sotto la
  // base w3id.org/arco/resource/..., mai sotto quella nazionale mibact/luoghi già usata da
  // scripts/places/mic/fetch.ts per i musei "non regionali" (Lazio compreso, dove vive Canepina).
  // Questo probe non dipende da un museo specifico: filtra DIRETTAMENTE sulla base URI
  // dell'oggetto, su un campione di triple hasCulturalInstituteOrSite reali — risponde "sì/no"
  // indipendentemente da quale museo si scelga.
  {
    name: 'hasCulturalInstituteOrSite-verso-namespace-nazionale (NON verificato)',
    note: "Tra le triple hasCulturalInstituteOrSite reali, ce n'è almeno una il cui oggetto è sotto la base nazionale mibact/luoghi (quella già usata dai musei Lazio/altre regioni importati in Dtrek)? Se 0, la ricostruzione dell'URI dal source_id NON può funzionare per NESSUN museo di quella famiglia, non solo per Canepina.",
    query: `${PREFIXES}
SELECT ?opera ?cis WHERE {
  ?opera loc:hasCulturalInstituteOrSite ?cis .
  FILTER(STRSTARTS(STR(?cis), "http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/"))
} LIMIT ${PROBE_LIMIT}`,
  },
  {
    name: 'culturalproperty+hasCulturalInstituteOrSite-combo (NON verificato)',
    note: "Co-occorrenza: un'istanza REALE di arco:CulturalProperty che ha ANCHE il predicato di collegamento popolato (direzione forward). Se questo probe ha risultati, l'IRI di ?opera qui è il miglior candidato per --describe (dump esaustivo dei suoi campi reali: titolo, autore, datazione, immagine).",
    query: `${PREFIXES}
SELECT ?opera ?cis WHERE {
  ?opera a arco:CulturalProperty ;
         loc:hasCulturalInstituteOrSite ?cis .
} LIMIT ${PROBE_LIMIT}`,
  },
]

// Pura, testabile senza rete. `cisId` è l'id numerico ArCo già presente in dtrek_places.source_id
// per le righe con source='mic' (lo stesso id usato da scripts/places/mic/fetch.ts per sourceUrl)
// — MAI un id indovinato: il chiamante lo prende da una riga reale già importata.
export function buildCisUri(cisId: string): string {
  return `${CIS_RESOURCE_BASE}${cisId}`
}

// Pura, testabile senza rete. Query mirata: "quali opere (se esiste il predicato) sono collegate a
// QUESTO museo già in Dtrek" — non un campione generico come i PROBES sopra.
export function buildOperaByCisQuery(cisId: string): string {
  return `${PREFIXES}
SELECT ?opera WHERE {
  ?opera loc:hasCulturalInstituteOrSite <${buildCisUri(cisId)}> .
} LIMIT 50`
}

// Pura, testabile senza rete. Dump a 2 salti di UNA CulturalProperty arbitraria (o filtrata per
// rdfs:label) — stesso pattern già verificato utile in scripts/places/mic/fetch.ts (runDescribe)
// per scoprire campi reali (lì: description/orari/contatti) mai dedotti dalla sola ontologia.
export function buildDescribeOperaQuery(nameFilter?: string): string {
  if (!nameFilter) {
    return `${PREFIXES}
SELECT ?opera ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?opera WHERE { ?opera a arco:CulturalProperty . } LIMIT 1 }
  ?opera ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`
  }
  const escaped = nameFilter.replace(/"/g, '')
  return `${PREFIXES}
SELECT ?opera ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?opera WHERE {
      ?opera a arco:CulturalProperty ; rdfs:label ?name .
      FILTER(CONTAINS(LCASE(?name), LCASE("${escaped}")))
    } LIMIT 1 }
  ?opera ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`
}

// Pura, testabile senza rete. Dump a 2 salti della PRIMA opera collegata a un museo specifico già
// in Dtrek (via il predicato forward, non ancora confermato) — combina buildOperaByCisQuery con lo
// stesso pattern di dump di buildDescribeOperaQuery.
export function buildDescribeOperaByCisQuery(cisId: string): string {
  return `${PREFIXES}
SELECT ?opera ?p1 ?o1 ?p2 ?o2 WHERE {
  { SELECT ?opera WHERE {
      ?opera loc:hasCulturalInstituteOrSite <${buildCisUri(cisId)}> .
    } LIMIT 1 }
  ?opera ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
}`
}

// ── Copertura per "famiglia" di URI museo (2026-09-27, dopo il probe negativo su namespace nazionale) ──
// `hasCulturalInstituteOrSite-verso-namespace-nazionale` ha dato 0/5 su un campione (vedi
// docs/arco-opere-musei.md §5bis) — nessuna opera osservata punta a un museo della base
// `mibact/luoghi` (quella già usata da Dtrek per Lazio e altre regioni "nazionali", Canepina
// inclusa). Prima di concludere che l'intero meccanismo non copre quei musei, serve sapere QUANTE
// famiglie di URI esistono e con che peso — un campione più ampio (non un singolo museo, non un
// filtro stringa rischioso lato server: stessa cautela già dimostrata in
// scripts/places/mic/probe.ts round 2/3 con CONTAINS/LCASE) aggregato lato client, come già fatto
// per bindings multi-valore in quel file.
const COVERAGE_SAMPLE_LIMIT = 500

// Pura, testabile senza rete. Raggruppa un URI museo per "famiglia" (tutto fino a e incluso l'ultimo
// `CulturalInstituteOrSite/`) — distingue mibact/luoghi (nazionale) da w3id.org/arco/resource/...
// (generico) da w3id.org/arco/resource/<Regione>/... (regionale, es. AltoAdige) senza assumere quali
// famiglie esistano.
export function extractCisFamily(cisUri: string): string {
  const marker = 'CulturalInstituteOrSite/'
  const idx = cisUri.indexOf(marker)
  return idx === -1 ? cisUri : cisUri.slice(0, idx + marker.length)
}

// Pura, testabile senza rete. Conta le occorrenze per famiglia, ordinate per frequenza decrescente —
// più leggibile di un elenco di URI grezzi per capire dove si concentra la copertura reale.
export function summarizeCisFamilies(cisUris: string[]): { family: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const uri of cisUris) {
    counts.set(extractCisFamily(uri), (counts.get(extractCisFamily(uri)) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count)
}

// Pura, testabile senza rete. Campione ampio (non filtrato per famiglia — a differenza del probe
// 'hasCulturalInstituteOrSite-verso-namespace-nazionale' sopra, qui si guarda TUTTO ciò che il
// motore restituisce per capire la distribuzione reale, non solo confermare/smentire una famiglia).
export function buildCoverageQuery(limit = COVERAGE_SAMPLE_LIMIT): string {
  return `${PREFIXES}
SELECT ?cis WHERE {
  ?opera loc:hasCulturalInstituteOrSite ?cis .
} LIMIT ${limit}`
}

// ── Dump generico di un URI qualunque (2026-09-27, dopo --coverage: 500/500 record puntano alla
// famiglia GENERICA w3id.org/arco/resource/CulturalInstituteOrSite/<hash>, MAI a mibact/luoghi —
// campione ampio, non più un caso raro) ─────────────────────────────────────────────────────────
// Prima di concludere se questi musei "hash" sono le STESSE istituzioni già in Dtrek sotto un altro
// URI (es. tramite owl:sameAs) o un universo di cataloghi diverso, serve sapere COSA sono — stesso
// principio del --describe già usato per i CIS mibact/luoghi (mai indovinare un campo, dumparlo).
// Generico (non solo per un CIS) perché la prossima domanda utile potrebbe riguardare anche un'opera
// o un altro tipo di risorsa trovata in un risultato precedente.
export function buildDescribeUriQuery(uri: string): string {
  return `
SELECT ?p1 ?o1 ?p2 ?o2 WHERE {
  <${uri}> ?p1 ?o1 .
  OPTIONAL { ?o1 ?p2 ?o2 . }
} LIMIT 200`
}

// ── loc:isCulturalInstituteOrSiteOf (2026-09-27, trovato con --describe-uri sul Museo
// Archeologico Nazionale di Firenze — museo "hash" reale, non una collezione oscura) ────────────
// Predicato USATO DIRETTAMENTE SUL MUSEO verso un'opera che possiede — probabile inverso "pulito"
// di hasCulturalInstituteOrSite (opera→museo), più diretto per elencare le opere DI un museo
// partendo dal museo stesso invece di cercarle a ritroso su tutto il catalogo. MAI verificato prima
// d'ora (un solo esempio visto in un dump parziale) — questi probe lo confermano su scala.
export function buildWorksCountQuery(cisUri: string): string {
  return `
PREFIX loc: <https://w3id.org/arco/ontology/location/>
SELECT (COUNT(?opera) AS ?count) WHERE {
  <${cisUri}> loc:isCulturalInstituteOrSiteOf ?opera .
}`
}

export function buildWorksSampleQuery(cisUri: string, limit = 20): string {
  return `
PREFIX loc: <https://w3id.org/arco/ontology/location/>
SELECT ?opera WHERE {
  <${cisUri}> loc:isCulturalInstituteOrSiteOf ?opera .
} LIMIT ${limit}`
}

// ── Formattazione compatta dei dump --describe/--describe-uri (2026-09-27, feedback dal vivo:
// l'output JSON grezzo di un dump a 2 salti è troppo grande da incollare da Termux) ──────────────
// Un dump a 2 salti produce una riga per OGNI combinazione p1/o1/p2/o2 — quando o1 ha molte
// proprietà dirette (es. un museo con decine di `isCulturalInstituteOrSiteOf`), lo stesso p1/o1 si
// ripete su più righe. Raggruppare per p1/o1 e accorciare gli URI al solo nome locale (dopo l'ultimo
// `/` o `#`) riduce drasticamente il testo senza perdere informazione — e `--grep` filtra a monte
// per non dover incollare tutto solo per cercare, es., "sameAs" o "label".
export function localName(uri: string): string {
  const withoutHash = uri.split('#').pop() ?? uri
  return withoutHash.split('/').pop() || uri
}

export interface DescribeBinding { p1: string; o1: string; p2?: string; o2?: string }

export function formatDescribeBindings(bindings: DescribeBinding[], grepTerm?: string): string[] {
  const needle = grepTerm?.toLowerCase()
  const matches = (b: DescribeBinding) =>
    !needle || [b.p1, b.o1, b.p2, b.o2].some(v => v?.toLowerCase().includes(needle))

  const groups = new Map<string, { p1: string; o1: string; hops: Set<string> }>()
  for (const b of bindings.filter(matches)) {
    const key = `${b.p1}\u0000${b.o1}`
    if (!groups.has(key)) groups.set(key, { p1: b.p1, o1: b.o1, hops: new Set() })
    if (b.p2 && b.o2) groups.get(key)!.hops.add(`${localName(b.p2)} = ${localName(b.o2)}`)
  }

  const lines: string[] = []
  for (const { p1, o1, hops } of groups.values()) {
    lines.push(`${localName(p1)} = ${localName(o1)}`)
    for (const hop of hops) lines.push(`    -> ${hop}`)
  }
  return lines
}

export interface ProbeResult {
  name: string
  note: string
  httpStatus: number | 'TIMEOUT' | 'ERROR'
  durationMs: number
  resultCount: number | null
  sample: unknown
  bindings: unknown[]
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
        bindings: [],
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
      bindings,
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
      bindings: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

async function runDiagnosticQuery(label: string, query: string, timeoutMs: number): Promise<void> {
  console.log(`Interrogo ${SPARQL_ENDPOINT} — ${label}…`)
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
    body: `query=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    console.error(`${label}: HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`)
    return
  }
  console.log(JSON.stringify(await res.json(), null, 2))
}

// Cap sulle righe stampate — un dump di un museo con molte opere può avere centinaia di gruppi
// p1/o1: senza un tetto, il testo resta comunque troppo grande da incollare. `--grep` (per trovare
// un predicato specifico, es. "sameAs") non ha bisogno di questo limite quanto il dump completo.
const DESCRIBE_PRINT_CAP = 60

async function runDescribeQuery(label: string, query: string, timeoutMs: number, grepTerm?: string): Promise<void> {
  console.log(`Interrogo ${SPARQL_ENDPOINT} — ${label}${grepTerm ? ` (filtro: "${grepTerm}")` : ''}…`)
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
    body: `query=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    console.error(`${label}: HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`)
    return
  }
  const data = await res.json() as { results?: { bindings?: Record<string, { value: string }>[] } }
  const raw = data.results?.bindings ?? []
  const bindings: DescribeBinding[] = raw.map(b => ({ p1: b.p1?.value ?? '', o1: b.o1?.value ?? '', p2: b.p2?.value, o2: b.o2?.value }))
  const lines = formatDescribeBindings(bindings, grepTerm)
  if (lines.length === 0) {
    console.log(grepTerm ? `Nessuna corrispondenza per "${grepTerm}".` : 'Nessun risultato.')
    return
  }
  const shown = lines.slice(0, DESCRIBE_PRINT_CAP)
  console.log(shown.join('\n'))
  if (lines.length > DESCRIBE_PRINT_CAP) {
    console.log(`\n… troncato: ${lines.length - DESCRIBE_PRINT_CAP} righe in più non mostrate. Usa --grep "<termine>" per restringere.`)
  }
}

async function runCoverage(timeoutMs: number, limit: number): Promise<void> {
  console.log(`Interrogo ${SPARQL_ENDPOINT} — campione di ${limit} triple hasCulturalInstituteOrSite, aggregazione per famiglia di URI museo (lato client)…`)
  const res = await fetch(SPARQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
    body: `query=${encodeURIComponent(buildCoverageQuery(limit))}`,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    console.error(`HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`)
    return
  }
  const data = await res.json() as { results?: { bindings?: { cis?: { value: string } }[] } }
  const uris = (data.results?.bindings ?? []).map(b => b.cis?.value).filter((v): v is string => !!v)
  const summary = summarizeCisFamilies(uris)
  console.log(`${uris.length} triple nel campione, ${summary.length} famiglie distinte:\n`)
  for (const { family, count } of summary) {
    console.log(`  ${count.toString().padStart(4)}  ${family}`)
  }
  const nationalFamily = 'http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/'
  const nationalCount = summary.find(s => s.family === nationalFamily)?.count ?? 0
  console.log(`\nFamiglia nazionale (già usata da Dtrek per Lazio/altre regioni, mibact/luoghi): ${nationalCount}/${uris.length}.`)
}

async function main() {
  const timeoutIdx = process.argv.indexOf('--timeout')
  const timeoutMs = timeoutIdx !== -1 ? parseInt(process.argv[timeoutIdx + 1], 10) : DEFAULT_TIMEOUT_MS

  const worksIdx = process.argv.indexOf('--museo-opere')
  if (worksIdx !== -1) {
    const cisUri = process.argv[worksIdx + 1]
    await runDiagnosticQuery(`conteggio opere di ${cisUri} (loc:isCulturalInstituteOrSiteOf)`, buildWorksCountQuery(cisUri), timeoutMs)
    await runDiagnosticQuery(`campione opere di ${cisUri}`, buildWorksSampleQuery(cisUri), timeoutMs)
    return
  }

  const grepIdx = process.argv.indexOf('--grep')
  const grepTerm = grepIdx !== -1 ? process.argv[grepIdx + 1] : undefined

  const describeUriIdx = process.argv.indexOf('--describe-uri')
  if (describeUriIdx !== -1) {
    const uri = process.argv[describeUriIdx + 1]
    await runDescribeQuery(`proprietà dirette (2 salti) di ${uri}`, buildDescribeUriQuery(uri), timeoutMs, grepTerm)
    return
  }

  if (process.argv.includes('--coverage')) {
    const limitIdx = process.argv.indexOf('--limit')
    const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : COVERAGE_SAMPLE_LIMIT
    await runCoverage(timeoutMs, limit)
    return
  }

  if (process.argv.includes('--describe')) {
    const nameIdx = process.argv.indexOf('--name')
    const cisIdx = process.argv.indexOf('--cis')
    if (cisIdx !== -1) {
      const cisId = process.argv[cisIdx + 1]
      await runDescribeQuery(`prima opera collegata al museo CIS/${cisId}`, buildDescribeOperaByCisQuery(cisId), timeoutMs, grepTerm)
      return
    }
    const name = nameIdx !== -1 ? process.argv[nameIdx + 1] : undefined
    await runDescribeQuery(
      name ? `struttura reale della prima opera il cui rdfs:label contiene "${name}"` : 'struttura reale di una CulturalProperty arbitraria',
      buildDescribeOperaQuery(name),
      timeoutMs,
      grepTerm,
    )
    return
  }

  const cisIdx = process.argv.indexOf('--cis')
  if (cisIdx !== -1) {
    const cisId = process.argv[cisIdx + 1]
    await runDiagnosticQuery(`opere collegate al museo CIS/${cisId} (predicato forward, non confermato)`, buildOperaByCisQuery(cisId), timeoutMs)
    return
  }

  const onlyIdx = process.argv.indexOf('--only')
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : undefined
  const probes = only ? PROBES.filter(p => p.name === only) : PROBES
  if (only && probes.length === 0) {
    console.error(`Nessun probe con nome "${only}". Disponibili: ${PROBES.map(p => p.name).join(', ')}`)
    process.exit(1)
  }

  console.log(`Interrogo ${SPARQL_ENDPOINT} — ${probes.length} probe, timeout ${timeoutMs}ms ciascuno, in sequenza, un solo tentativo per probe.\n`)
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

const isDirectRun = process.argv[1]?.endsWith('probe.ts') && process.argv[1]?.includes('opere')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
