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
    name: 'hasCulturalInstituteOrSite-reverse (NON verificato)',
    note: 'Stesso predicato, direzione invertita (museo→opera) — verifica difensiva: fetch.ts ha già un precedente in cui la direzione/predicato suggerito dalla sola documentazione non corrispondeva ai dati reali (hasTimeIndexedTypedLocation/atSite vs cis:hasSite).',
    query: `${PREFIXES}
SELECT ?cis ?opera WHERE {
  ?cis loc:hasCulturalInstituteOrSite ?opera .
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

async function main() {
  const timeoutIdx = process.argv.indexOf('--timeout')
  const timeoutMs = timeoutIdx !== -1 ? parseInt(process.argv[timeoutIdx + 1], 10) : DEFAULT_TIMEOUT_MS

  if (process.argv.includes('--describe')) {
    const nameIdx = process.argv.indexOf('--name')
    const cisIdx = process.argv.indexOf('--cis')
    if (cisIdx !== -1) {
      const cisId = process.argv[cisIdx + 1]
      await runDiagnosticQuery(`prima opera collegata al museo CIS/${cisId}`, buildDescribeOperaByCisQuery(cisId), timeoutMs)
      return
    }
    const name = nameIdx !== -1 ? process.argv[nameIdx + 1] : undefined
    await runDiagnosticQuery(
      name ? `struttura reale della prima opera il cui rdfs:label contiene "${name}"` : 'struttura reale di una CulturalProperty arbitraria',
      buildDescribeOperaQuery(name),
      timeoutMs,
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
