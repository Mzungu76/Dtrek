/**
 * ISTAT (via opendatasicilia/comuni-italiani) → arricchimento popolazione + subtype su dtrek_places
 *
 * Piano `docs/piano-mete-multitipologia.md` §6: "NON assumere Comune = Borgo... Dtrek determina
 * successivamente la classificazione turistica". I 7.896 Comuni importati da ISTAT (source='istat')
 * non hanno alcun segnale di rilevanza — Roma e un Comune di 80 abitanti sono oggi indistinguibili
 * (subtype NULL su tutte le righe, verificato sul database reale il 2026-09-16). Questo script
 * NON crea righe (stesso pattern non invasivo di scripts/places/wikidata/enrich.ts): legge
 * popolazione da una fonte esterna e fa UPDATE di `population`/`subtype` su righe già esistenti.
 *
 * ── Fonte ────────────────────────────────────────────────────────────────────────────────────
 * ISTAT non pubblica popolazione e confini nello stesso dataset (quello usato da
 * scripts/places/istat/fetch.ts è solo "Confini delle unità amministrative", niente demografia —
 * la popolazione ISTAT vive in un portale separato, demo.istat.it, la cui area download non è
 * raggiungibile da nessun ambiente disponibile in questa sessione, nemmeno per ispezionarla).
 *
 * Fonte usata: https://github.com/opendatasicilia/comuni-italiani (progetto comunitario, dati
 * ri-pubblicati da fonti ufficiali AgID/ISTAT) — file verificato leggendo il contenuto reale (non
 * indovinato) il 2026-09-17:
 *   https://raw.githubusercontent.com/opendatasicilia/comuni-italiani/main/dati/popolazione_2021.csv
 * Header verificato: `pro_com_t,pop_res_21` — es. `1001,2548`.
 *
 * ATTENZIONE — pro_com_t in questo file NON è zero-padded a 6 cifre (es. "1001", non "001001")
 * nonostante il nome suggerisca il formato alfanumerico usato altrove nel repository
 * (scripts/places/istat/fetch.ts, PRO_COM_T dallo shapefile, sempre 6 cifre — verificato con
 * Agliè, "001001"). Questo script applica `padStart(6, '0')` per far combaciare i due formati —
 * verificare il tasso di abbinamento nel dry-run prima di scrivere: un tasso basso indicherebbe
 * un'ipotesi di formato sbagliata (stesso errore già fatto due volte con le coordinate MiC).
 *
 * Nota licenza: il repository non dichiara una licenza esplicita (nessun file LICENSE). La
 * popolazione per Comune è però un dato statistico fattuale, ripubblicato da fonte ISTAT — stesso
 * trattamento "arricchimento, non fonte primaria" già riservato a Wikidata (piano §11): se in
 * futuro emergesse un problema di licenza, il campo si può ripopolare da demo.istat.it senza
 * impatto sullo schema.
 *
 * ── Classificazione borgo/città (piano §6) ──────────────────────────────────────────────────────
 * Nessuna soglia ufficiale ISTAT distingue "borgo" da "città" (il titolo di "città" è un
 * riconoscimento storico/onorifico, scollegato dalla popolazione). La soglia sotto è un punto di
 * partenza Dtrek dichiarato, non una definizione ufficiale — regolabile con --citta-threshold.
 *
 * Usage:
 *   npx tsx scripts/places/istat/population.ts [--dry-run] [--limit N] [--citta-threshold 15000]
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlaceCategory } from '../../lib/metaTypes'

const POPULATION_CSV_URL = 'https://raw.githubusercontent.com/opendatasicilia/comuni-italiani/main/dati/popolazione_2021.csv'
const DEFAULT_CITTA_THRESHOLD = 15000
const CONCURRENCY = 20

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 4

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(url: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1))
    let res: Response
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    } catch (e) {
      lastError = e
      continue
    }
    if (res.ok) return res.text()
    if (!TRANSIENT_STATUS.has(res.status)) throw new Error(`Download popolazione ${res.status}: ${url}`)
    lastError = new Error(`Download popolazione ${res.status}`)
  }
  throw lastError instanceof Error ? lastError : new Error('Download popolazione: troppi tentativi falliti')
}

// Pura, testabile senza rete — pro_com_t nel CSV non è zero-padded (vedi nota in cima al file),
// municipality_istat_code su dtrek_places sì (sempre 6 cifre, da PRO_COM_T dello shapefile).
export function parsePopulationCsv(csv: string): Map<string, number> {
  const map = new Map<string, number>()
  const lines = csv.trim().split('\n')
  const header = lines[0]?.split(',').map(h => h.trim())
  const idxCode = header?.indexOf('pro_com_t') ?? -1
  const idxPop = header?.indexOf('pop_res_21') ?? -1
  if (idxCode === -1 || idxPop === -1) return map

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const rawCode = cols[idxCode]?.trim()
    const pop = cols[idxPop] ? parseInt(cols[idxPop], 10) : NaN
    if (!rawCode || Number.isNaN(pop)) continue
    map.set(rawCode.padStart(6, '0'), pop)
  }
  return map
}

// Pura, testabile — soglia dichiarata Dtrek (piano §6), non una definizione ufficiale.
export function classifySubtype(population: number, cittaThreshold: number): PlaceCategory {
  return population >= cittaThreshold ? 'citta' : 'borgo'
}

interface IstatPlaceRow {
  id: string
  municipality_istat_code: string | null
}

async function findIstatPlaces(supabase: SupabaseClient, limit?: number): Promise<IstatPlaceRow[]> {
  let query = supabase
    .from('dtrek_places')
    .select('id, municipality_istat_code')
    .eq('source', 'istat')
  if (limit) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as IstatPlaceRow[]
}

async function updatePopulation(supabase: SupabaseClient, id: string, population: number, subtype: PlaceCategory): Promise<void> {
  const { error } = await supabase.from('dtrek_places').update({ population, subtype }).eq('id', id)
  if (error) throw error
}

// Concorrenza limitata invece di un await sequenziale su migliaia di righe (stesso problema di
// lentezza già osservato sull'import ISTAT via importPlaceCandidates, ~40-80 minuti per 7.896
// righe) — qui non c'è dedup da fare per riga (solo un UPDATE diretto per id), quindi il
// parallelismo è sicuro.
async function updateWithConcurrency(
  supabase: SupabaseClient,
  updates: { id: string; population: number; subtype: PlaceCategory }[],
  concurrency: number,
): Promise<{ done: number; errors: number }> {
  let done = 0, errors = 0
  let nextIndex = 0

  async function worker() {
    while (nextIndex < updates.length) {
      const item = updates[nextIndex++]
      try {
        await updatePopulation(supabase, item.id, item.population, item.subtype)
        done++
      } catch (e) {
        errors++
        console.error(`${item.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, updates.length) }, worker))
  return { done, errors }
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : undefined
  const thresholdIdx = process.argv.indexOf('--citta-threshold')
  const cittaThreshold = thresholdIdx !== -1 ? parseInt(process.argv[thresholdIdx + 1], 10) : DEFAULT_CITTA_THRESHOLD

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.')
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  console.log(`Scarico ${POPULATION_CSV_URL}…`)
  const csv = await fetchWithRetry(POPULATION_CSV_URL)
  const popByCode = parsePopulationCsv(csv)
  console.log(`${popByCode.size} Comuni con popolazione nel CSV.`)

  const places = await findIstatPlaces(supabase, limit)
  console.log(`${places.length} righe borgo_citta da ISTAT in dtrek_places.`)

  const updates: { id: string; population: number; subtype: PlaceCategory }[] = []
  let unmatched = 0
  for (const place of places) {
    const pop = place.municipality_istat_code ? popByCode.get(place.municipality_istat_code) : undefined
    if (pop === undefined) { unmatched++; continue }
    updates.push({ id: place.id, population: pop, subtype: classifySubtype(pop, cittaThreshold) })
  }

  const citta = updates.filter(u => u.subtype === 'citta').length
  const borgo = updates.length - citta
  const matchRate = places.length > 0 ? (updates.length / places.length * 100).toFixed(1) : '0'
  console.log(`Abbinate: ${updates.length}/${places.length} (${matchRate}%) — non abbinate: ${unmatched}.`)
  console.log(`Classificazione (soglia ${cittaThreshold} abitanti): ${citta} 'citta', ${borgo} 'borgo'.`)

  if (DRY_RUN) {
    console.log('[DRY RUN] Esempio (prime 5):', JSON.stringify(updates.slice(0, 5), null, 2))
    console.log('[DRY RUN] Nessuna scrittura.')
    return
  }

  const { done, errors } = await updateWithConcurrency(supabase, updates, CONCURRENCY)
  console.log(`Fatto: ${done} righe aggiornate, ${errors} errori.`)
}

const isDirectRun = process.argv[1]?.endsWith('population.ts')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
