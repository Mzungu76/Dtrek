/**
 * Wikidata — probe diagnostico per "Opere di questo museo", alternativa ad ArCo
 * (docs/arco-opere-musei.md — chiuso negativamente: copertura reale insufficiente, ~8 musei
 * ben catalogati su 2.296 già in Dtrek).
 *
 * Verificato dal vivo in questa sessione (2026-09-27, via Termux, prima dell'aggiunta di questo
 * file): `wdt:P195` (collezione) e `wdt:P276` (ubicazione) collegano un'opera d'arte al museo che
 * la conserva, con copertura molto più alta di ArCo per i grandi musei — Galleria Borghese 240
 * opere, Musei Capitolini 302, Galleria nazionale d'arte moderna 153 (contro 1/1/0 su ArCo per gli
 * stessi tre). Per musei piccoli/tematici (Museo civico di Vignola, Museo civico di San Damiano
 * d'Asti) il museo stesso ha un item Wikidata ma 0 opere collegate — atteso, non un errore: sono
 * musei locali/tematici, non gallerie d'arte.
 *
 * ── Lezione già pagata in questa sessione: MAI cercare un'entità per nome con CONTAINS/LCASE su
 * rdfs:label in SPARQL contro l'endpoint Wikidata ──────────────────────────────────────────────
 * Un primo tentativo (`FILTER(CONTAINS(LCASE(?itemLabel), ...))` su TUTTE le etichette di Wikidata,
 * centinaia di milioni) è andato in timeout dopo 30s — non indicizzato per subset di questo tipo,
 * a differenza di una query mirata su un QID già noto (P195/P276 sotto, veloce perché indicizzata).
 * La ricerca per nome usa invece l'API REST dedicata `wbsearchentities`
 * (`https://www.wikidata.org/w/api.php`), pensata per questo — verificata reale, sub-secondo.
 *
 * Nessuna scrittura, nessun Supabase — solo lettura. Nessuna riga di questo file è stata eseguita
 * contro l'endpoint reale (rete di questa sessione bloccata verso `query.wikidata.org` e
 * `www.wikidata.org`, stesso blocco già documentato per ArCo/ISTAT/PTPR — vedi
 * `scripts/places/wikidata/enrich.ts`): i test dal vivo citati sopra sono stati eseguiti
 * dall'utente via Termux con uno script equivalente incollato in chat, non con questo file.
 *
 * Usage (diagnostica):
 *   npx tsx scripts/places/wikidata/opere/probe.ts --find "Galleria Borghese"      # cerca il QID di un museo per nome (wbsearchentities)
 *   npx tsx scripts/places/wikidata/opere/probe.ts --count Q841506                 # conta le opere collegate (P195/P276)
 *   npx tsx scripts/places/wikidata/opere/probe.ts --sample Q841506 [--limit 10]   # campione di opere con titolo/immagine/autore/anno
 *   npx tsx scripts/places/wikidata/opere/probe.ts --museo "Galleria Borghese"     # combina find+count in un solo comando
 */

const SEARCH_ENDPOINT = 'https://www.wikidata.org/w/api.php'
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'DTrek/1.0 (places catalog diagnostics; mzulpt@gmail.com)'
const DEFAULT_TIMEOUT_MS = 20000
const DEFAULT_SAMPLE_LIMIT = 10

export interface MuseumMatch {
  qid: string
  label: string
  description?: string
}

// Pura solo nella forma dell'URL — la chiamata è I/O, ma costruire l'URL separatamente lo rende
// testabile senza rete (stesso principio dei buildXQuery in scripts/places/mic/opere/probe.ts).
export function buildSearchUrl(name: string, language = 'it'): string {
  return `${SEARCH_ENDPOINT}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=${language}&format=json&type=item&limit=1`
}

// Pura, testabile senza rete. P195 (collezione) e P276 (ubicazione) — entrambe le proprietà usate
// insieme (UNION+DISTINCT, mai solo una): un'opera può dichiarare l'una, l'altra, o entrambe.
// Verificato reale sul QID di Galleria Borghese: entrambi i predicati necessari per il totale
// osservato (240), nessuna delle due presa isolatamente è stata testata separatamente in questa
// sessione — se in futuro serve sapere quale delle due contribuisce di più, va isolata a parte.
export function buildWorksCountQuery(qid: string): string {
  return `
SELECT (COUNT(DISTINCT ?opera) AS ?count) WHERE {
  { ?opera wdt:P195 wd:${qid} . }
  UNION
  { ?opera wdt:P276 wd:${qid} . }
}`
}

// Pura, testabile senza rete. Campione con i campi più utili per una card "opera" (titolo via
// SERVICE wikibase:label, immagine P18, autore P170, anno P571) — nessuno di questi verificato
// popolato su scala in questa sessione (solo il conteggio è stato verificato dal vivo): da
// verificare con --sample prima di assumerli sempre presenti.
export function buildWorksSampleQuery(qid: string, limit = DEFAULT_SAMPLE_LIMIT): string {
  return `
SELECT ?opera ?operaLabel ?image ?creatorLabel ?inception WHERE {
  { ?opera wdt:P195 wd:${qid} . }
  UNION
  { ?opera wdt:P276 wd:${qid} . }
  OPTIONAL { ?opera wdt:P18 ?image . }
  OPTIONAL { ?opera wdt:P170 ?creator . }
  OPTIONAL { ?opera wdt:P571 ?inception . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en" . }
} LIMIT ${limit}`
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function sparqlSelect(query: string, timeoutMs: number): Promise<Record<string, { value: string }>[]> {
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
  if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json() as { results?: { bindings?: Record<string, { value: string }>[] } }
  return data.results?.bindings ?? []
}

export async function findMuseumQid(name: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<MuseumMatch | null> {
  const data = await fetchJson(buildSearchUrl(name), timeoutMs) as { search?: { id: string; label: string; description?: string }[] }
  const first = data.search?.[0]
  return first ? { qid: first.id, label: first.label, description: first.description } : null
}

export async function countWorks(qid: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
  const rows = await sparqlSelect(buildWorksCountQuery(qid), timeoutMs)
  return parseInt(rows[0]?.count?.value ?? '0', 10)
}

async function main() {
  const timeoutIdx = process.argv.indexOf('--timeout')
  const timeoutMs = timeoutIdx !== -1 ? parseInt(process.argv[timeoutIdx + 1], 10) : DEFAULT_TIMEOUT_MS

  const museoIdx = process.argv.indexOf('--museo')
  if (museoIdx !== -1) {
    const name = process.argv[museoIdx + 1]
    console.log(`Cerco "${name}" su Wikidata…`)
    const found = await findMuseumQid(name, timeoutMs)
    if (!found) { console.log('Nessun QID trovato.'); return }
    console.log(`Trovato ${found.qid} — ${found.label}${found.description ? ` (${found.description})` : ''}`)
    const count = await countWorks(found.qid, timeoutMs)
    console.log(`Opere collegate (P195/P276): ${count}`)
    return
  }

  const findIdx = process.argv.indexOf('--find')
  if (findIdx !== -1) {
    const name = process.argv[findIdx + 1]
    const found = await findMuseumQid(name, timeoutMs)
    console.log(found ? `${found.qid} — ${found.label}${found.description ? ` (${found.description})` : ''}` : 'Nessun QID trovato.')
    return
  }

  const countIdx = process.argv.indexOf('--count')
  if (countIdx !== -1) {
    const qid = process.argv[countIdx + 1]
    console.log(`Opere collegate a ${qid} (P195/P276): ${await countWorks(qid, timeoutMs)}`)
    return
  }

  const sampleIdx = process.argv.indexOf('--sample')
  if (sampleIdx !== -1) {
    const qid = process.argv[sampleIdx + 1]
    const limitIdx = process.argv.indexOf('--limit')
    const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : DEFAULT_SAMPLE_LIMIT
    const rows = await sparqlSelect(buildWorksSampleQuery(qid, limit), timeoutMs)
    for (const row of rows) {
      const label = row.operaLabel?.value ?? '(senza titolo)'
      const creator = row.creatorLabel?.value ? `, ${row.creatorLabel.value}` : ''
      const year = row.inception?.value ? `, ${row.inception.value.slice(0, 4)}` : ''
      const hasImage = row.image?.value ? ' [immagine]' : ''
      console.log(`- ${label}${creator}${year}${hasImage}`)
    }
    return
  }

  console.error('Uso: --museo "<nome>" | --find "<nome>" | --count <QID> | --sample <QID> [--limit N]')
  process.exit(1)
}

const isDirectRun = process.argv[1]?.endsWith('probe.ts') && process.argv[1]?.includes('wikidata')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
