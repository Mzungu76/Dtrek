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
