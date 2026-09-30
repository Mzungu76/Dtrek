/**
 * Arricchimento mirato dei Siti MiC già in dtrek_places: descrizione e contatti letti da ArCo per
 * ID, non per regione.
 *
 * Perché esiste: la query di fetch.ts prende una fetta ARBITRARIA (sotto-query con LIMIT e senza
 * ORDER BY, vedi CANDIDATE_POOL_CAP) di ogni regione — un rilancio con limit alto può non
 * incontrare mai un dato Sito (verificato: Museo civico di Tolfa, ID 101608, presente in ArCo con
 * `l0:description`, ma fuori dalla fetta restituita in due run di fila). Qui si parte invece dalle
 * righe che abbiamo già (dtrek_place_sources, source='mic') e si chiede a ArCo proprio quegli ID
 * con un VALUES — nessuna fetta, nessuna dipendenza dall'ordine del catalogo.
 *
 * Riempie SOLO i campi oggi vuoti (description/website/phone/email), mai un overwrite di un valore
 * già presente.
 *
 * Usage:
 *   npx tsx scripts/places/mic/enrich.ts [--dry-run] [--source-id 101608] [--limit 200]
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchSparqlJson, stripMailto } from './fetch'
import { mergeMetadata } from '../import'
import type { FieldProvenance } from '../types'

const CIS_BASE = 'http://dati.beniculturali.it/mibact/luoghi/resource/CulturalInstituteOrSite/'
const SPARQL_BATCH = 40
const DB_PAGE = 1000
const BATCH_DELAY_MS = 300

export interface EnrichFields {
  description?: string
  phone?: string
  email?: string
  website?: string
  openingHours?: string
  // Solo "Chiusura" su tutti e 7 i giorni e nessun nodo "Orari di apertura": non è un orario vero,
  // vedi formatOpeningHours.
  closedAllDays?: boolean
}

type SparqlRow = Record<string, { value: string } | undefined>

// Solo ID numerici: finiscono dentro un IRI della query, mai testo libero.
export function buildEnrichQuery(ids: string[]): string {
  const values = ids.filter(id => /^\d+$/.test(id)).map(id => `<${CIS_BASE}${id}>`).join(' ')
  return `
PREFIX l0: <https://w3id.org/italia/onto/l0/>
PREFIX sm: <https://w3id.org/italia/onto/SM/>
PREFIX acc: <https://w3id.org/italia/onto/AccessCondition/>

SELECT DISTINCT ?cis ?description ?phone ?email ?website ?openingText ?closedText WHERE {
  VALUES ?cis { ${values} }
  OPTIONAL { ?cis l0:description ?description . }
  OPTIONAL { ?cis sm:hasOnlineContactPoint/sm:hasTelephone/sm:telephoneNumber ?phone . }
  OPTIONAL { ?cis sm:hasOnlineContactPoint/sm:hasEmail/sm:emailAddress ?email . }
  OPTIONAL { ?cis sm:hasOnlineContactPoint/sm:hasWebSite/sm:URL ?website . }
  # Orari (verificati con probe-hours su Biblioteca nazionale centrale di Roma): due nodi
  # OpeningHoursSpecification per CIS, distinti dal nome della risorsa — "Orari_di_apertura_<id>"
  # con l0:description "Lunedì (08:30,19:00)|…|Venerdì (08:30,14:30)", e "Chiusura_<id>" con i soli
  # giorni di chiusura "Sabato|Domenica".
  OPTIONAL {
    ?cis acc:hasAccessCondition ?openingNode .
    FILTER(CONTAINS(STR(?openingNode), "/OpeningHoursSpecification/Orari_di_apertura_"))
    ?openingNode l0:description ?openingText .
  }
  OPTIONAL {
    ?cis acc:hasAccessCondition ?closedNode .
    FILTER(CONTAINS(STR(?closedNode), "/OpeningHoursSpecification/Chiusura_"))
    ?closedNode l0:description ?closedText .
  }
}`
}

const WEEK = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
const WEEK_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function dayIndex(label: string): number {
  return WEEK.findIndex(d => d.toLowerCase() === label.trim().toLowerCase())
}

function daysLabel(first: number, last: number): string {
  return first === last ? WEEK_SHORT[first] : `${WEEK_SHORT[first]}–${WEEK_SHORT[last]}`
}

// Formati osservati (probe-hours, Biblioteca nazionale centrale di Roma):
//   aperture  "Lunedì (08:30,19:00)|Martedì (08:30,19:00)|…|Venerdì (08:30,14:30)"
//   chiusure  "Sabato|Domenica"
// Un giorno può avere più fasce (non ancora osservato): ogni "(HH:MM,HH:MM)" è una fascia. Giorni
// consecutivi con le stesse fasce sono raggruppati ("Lun–Gio 08:30–19:00; Ven 08:30–14:30").
// "Chiusura" su tutti e 7 i giorni senza alcun orario di apertura (Tolfa, Canepina) NON è un
// orario: per un piccolo museo comunale vuol quasi sempre dire "su prenotazione"/dato mai compilato,
// mostrarlo come "chiuso sempre" sarebbe più fuorviante che tacere. Pura, testabile senza rete.
export function formatOpeningHours(
  openingText: string | undefined,
  closedText: string | undefined,
): { text?: string; closedAllDays: boolean } {
  const slotsByDay = new Map<number, string>()
  for (const part of (openingText ?? '').split('|')) {
    const m = part.match(/^\s*([^\s(]+)\s*(.*)$/)
    if (!m) continue
    const day = dayIndex(m[1])
    const slots = [...m[2].matchAll(/\((\d{1,2}:\d{2})\s*,\s*(\d{1,2}:\d{2})\)/g)].map(x => `${x[1]}–${x[2]}`)
    if (day !== -1 && slots.length > 0) slotsByDay.set(day, slots.join(', '))
  }
  const closedDays = new Set(
    (closedText ?? '').split('|').map(dayIndex).filter(i => i !== -1),
  )

  if (slotsByDay.size === 0) {
    return { closedAllDays: closedDays.size === 7 }
  }

  const groups: string[] = []
  for (let i = 0; i < 7; ) {
    const slots = slotsByDay.get(i)
    if (slots === undefined) { i++; continue }
    let j = i
    while (slotsByDay.get(j + 1) === slots) j++
    groups.push(`${daysLabel(i, j)} ${slots}`)
    i = j + 1
  }
  const closedLabel = [...closedDays].filter(d => !slotsByDay.has(d)).sort((a, b) => a - b)
  if (closedLabel.length > 0) {
    let k = 0
    while (k < closedLabel.length) {
      let e = k
      while (closedLabel[e + 1] === closedLabel[e] + 1) e++
      groups.push(`${daysLabel(closedLabel[k], closedLabel[e])} chiuso`)
      k = e + 1
    }
  }
  return { text: groups.join('; '), closedAllDays: false }
}

// Un CIS può tornare su più righe (più contatti): per ogni campo vale il primo valore non vuoto.
export function parseEnrichRows(rows: SparqlRow[]): Map<string, EnrichFields> {
  const out = new Map<string, EnrichFields>()
  for (const row of rows) {
    const id = row.cis?.value.split('/').pop()
    if (!id) continue
    const cur = out.get(id) ?? {}
    const take = (field: keyof EnrichFields, raw: string | undefined) => {
      const v = raw?.trim()
      if (v && cur[field] === undefined) cur[field] = v
    }
    take('description', row.description?.value)
    take('phone', row.phone?.value)
    take('email', row.email?.value !== undefined ? stripMailto(row.email.value) : undefined)
    take('website', row.website?.value)
    // Più righe per lo stesso CIS (più contatti) ripetono gli stessi testi orari: si calcola una volta.
    if (cur.openingHours === undefined && cur.closedAllDays === undefined) {
      const hours = formatOpeningHours(row.openingText?.value, row.closedText?.value)
      if (hours.text !== undefined) cur.openingHours = hours.text
      else if (hours.closedAllDays) cur.closedAllDays = true
    }
    out.set(id, cur)
  }
  return out
}

export interface ExistingEnrichRow {
  description: string | null
  website: string | null
  phone: string | null
  email: string | null
  opening_hours: unknown
  metadata: Record<string, unknown> | null
}

// null quando non c'è nulla da scrivere (tutti i campi trovati sono già valorizzati o assenti in ArCo).
export function buildEnrichUpdate(
  existing: ExistingEnrichRow,
  found: EnrichFields,
  cisId: string,
  retrievedAt: string,
): Record<string, unknown> | null {
  const sourceUrl = `${CIS_BASE}${cisId}`
  const updates: Record<string, unknown> = {}
  const provenance: Record<string, FieldProvenance> = {}
  const fill = (field: keyof EnrichFields, column: keyof ExistingEnrichRow) => {
    const value = found[field]
    if (value === undefined || existing[column]) return
    updates[column] = value
    provenance[field] = { value, source: 'mic', sourceUrl, retrievedAt, confidence: 'high', status: 'ok' }
  }
  fill('description', 'description')
  fill('website', 'website')
  fill('phone', 'phone')
  fill('email', 'email')
  fill('openingHours', 'opening_hours')
  // Nessun valore da mostrare, ma la fonte ha dichiarato "chiuso tutti i giorni": lo si tiene solo
  // nella provenienza, marcato a bassa confidenza (mai un opening_hours che dica "chiuso sempre").
  const hoursAlreadyTracked = (existing.metadata?.fieldProvenance as Record<string, unknown> | undefined)?.openingHours !== undefined
  if (found.closedAllDays && !existing.opening_hours && !hoursAlreadyTracked) {
    provenance.openingHours = { value: null, source: 'mic', sourceUrl, retrievedAt, confidence: 'low', status: 'stale' }
  }
  if (Object.keys(updates).length === 0 && Object.keys(provenance).length === 0) return null
  updates.metadata = mergeMetadata(existing.metadata, { fieldProvenance: provenance })
  return updates
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchMicLinks(supabase: SupabaseClient, sourceId: string | null, limit: number): Promise<{ place_id: string; source_id: string }[]> {
  const out: { place_id: string; source_id: string }[] = []
  for (let from = 0; out.length < limit; from += DB_PAGE) {
    let q = supabase.from('dtrek_place_sources').select('place_id, source_id').eq('source', 'mic').order('source_id')
    if (sourceId) q = q.eq('source_id', sourceId)
    const { data, error } = await q.range(from, from + DB_PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []) as { place_id: string; source_id: string }[])
    if (!data || data.length < DB_PAGE) break
  }
  return out.slice(0, limit)
}

// Diagnostica compatta (nessun Supabase): tutte le proprietà dei nodi hasAccessCondition (orari,
// prenotazione, biglietti) dei primi 3 CIS il cui nome contiene `name` — il dump --describe di
// fetch.ts è troppo lungo per i log di GitHub Actions (le prime righe vengono troncate).
export function buildProbeHoursQuery(name: string): string {
  const escaped = name.replace(/["\\]/g, '')
  return `
PREFIX cis: <http://dati.beniculturali.it/cis/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX acc: <https://w3id.org/italia/onto/AccessCondition/>

SELECT ?name ?ac ?p ?o WHERE {
  { SELECT ?cis ?name WHERE {
      ?cis a cis:CulturalInstituteOrSite ; rdfs:label ?name .
      FILTER(CONTAINS(LCASE(?name), LCASE("${escaped}")))
    } LIMIT 3 }
  ?cis acc:hasAccessCondition ?ac .
  ?ac ?p ?o .
}`
}

async function probeHours(name: string): Promise<void> {
  console.log(`Nodi hasAccessCondition dei CIS il cui nome contiene "${name}"…`)
  const data = await fetchSparqlJson(buildProbeHoursQuery(name)) as { results: { bindings: SparqlRow[] } }
  const local = (v: string | undefined) => v?.split(/[/#]/).pop() ?? ''
  for (const row of data.results.bindings) {
    console.log([row.name?.value, local(row.ac?.value), local(row.p?.value), row.o?.value].join(' | '))
  }
  console.log(`${data.results.bindings.length} triple.`)
}

async function main() {
  const probeIdx = process.argv.indexOf('--probe-hours')
  if (probeIdx !== -1) {
    await probeHours(process.argv[probeIdx + 1])
    return
  }
  const dryRun = process.argv.includes('--dry-run')
  const sourceIdIdx = process.argv.indexOf('--source-id')
  const sourceId = sourceIdIdx !== -1 ? process.argv[sourceIdIdx + 1] : null
  const limitIdx = process.argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : Infinity

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars.')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const links = await fetchMicLinks(supabase, sourceId, limit)
  console.log(`${links.length} Siti con fonte MiC da arricchire${dryRun ? ' (dry-run, nessuna scrittura)' : ''}…`)

  const stats = { linked: links.length, batches: 0, failedBatches: 0, updated: 0, descriptionsFilled: 0, contactsFilled: 0, hoursFilled: 0 }
  const retrievedAt = new Date().toISOString()

  for (let i = 0; i < links.length; i += SPARQL_BATCH) {
    const chunk = links.slice(i, i + SPARQL_BATCH)
    stats.batches++
    let found: Map<string, EnrichFields>
    try {
      const data = await fetchSparqlJson(buildEnrichQuery(chunk.map(l => l.source_id))) as { results: { bindings: SparqlRow[] } }
      found = parseEnrichRows(data.results.bindings)
    } catch (e) {
      stats.failedBatches++
      console.error(`  batch ${stats.batches} saltato — ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    const { data: places, error } = await supabase
      .from('dtrek_places')
      .select('id, description, website, phone, email, opening_hours, metadata')
      .in('id', chunk.map(l => l.place_id))
    if (error) throw error
    const byId = new Map((places ?? []).map(p => [p.id as string, p as ExistingEnrichRow & { id: string }]))

    for (const link of chunk) {
      const existing = byId.get(link.place_id)
      const fields = found.get(link.source_id)
      if (!existing || !fields) continue
      const update = buildEnrichUpdate(existing, fields, link.source_id, retrievedAt)
      if (!update) continue
      if (!dryRun) {
        const { error: updateError } = await supabase.from('dtrek_places').update(update).eq('id', link.place_id)
        if (updateError) throw updateError
      }
      stats.updated++
      if (update.description !== undefined) stats.descriptionsFilled++
      if (update.website !== undefined || update.phone !== undefined || update.email !== undefined) stats.contactsFilled++
      if (update.opening_hours !== undefined) stats.hoursFilled++
    }
    await sleep(BATCH_DELAY_MS)
  }

  console.log(JSON.stringify(stats, null, 2))
}

const isDirectRun = process.argv[1]?.endsWith('enrich.ts') && process.argv[1]?.includes('mic')
if (isDirectRun) {
  main().catch(err => { console.error(err); process.exit(1) })
}
