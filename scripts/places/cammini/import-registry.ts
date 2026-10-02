import fs from 'fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildNearestFinder } from '../../../lib/cammini/geoFilter'
import type { RegistryEntry } from '../../../lib/cammini/registry'
import { isMultiSelector, resolveRegistryEntry, selectEntries } from '../../../lib/cammini/registrySelect'
import { exitCodeFor, summaryMarkdown, type RunRow } from '../../../lib/cammini/runSummary'
import type { TappaAnchor } from '../../../lib/cammini/tappe'
import { buildFromRegistry, type RegistryBuilt, type WayGeometry } from './buildRegistry'
import type { OverpassRelation } from './build'
import { downloadCammino } from './download'
import { importCammino } from './import'

// Importa un cammino del registro (lib/cammini/registry.ts) da OpenStreetMap, per gruppo di
// relazioni: scarica le relazioni col nome del cammino e le loro sotto-relazioni, poi la geometria
// delle way in blocchi, taglia fuori l'estero, ordina le tappe lungo il percorso e le controlla.
// Solo a piedi. Di default dry-run: scrive in database solo con --write.
//
// Uso:
//   npx tsx scripts/places/cammini/import-registry.ts --id cammino-san-benedetto            (dry-run)
//   npx tsx scripts/places/cammini/import-registry.ts --id cammino-san-benedetto --write
//   --save-fixture <file> / --fixture <file>: salva/rilegge la risposta grezza (build offline)
//   --min-status pronto|da_rivedere (con --write: scrive solo i cammini almeno a quel livello; default pronto)
//
// --id accetta un id, il nome ("Via Francigena"), `tutti` oppure `ondata-1|2|3`. Con più cammini: continua dopo gli
// errori, riprova i falliti in coda, pausa tra un cammino e l'altro (--pause-s, default 20), si ferma per tempo
// (--deadline-min) e scrive il riepilogo in $GITHUB_STEP_SUMMARY. Il download riprende dalla cache (CAMMINI_CACHE_DIR).

const NEAR_ITALY_KM = 25

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export { rootsQuery as relationsQuery, waysQuery } from './download'

async function loadPoints(supabase: SupabaseClient, metaType: string): Promise<{ id: string; name: string; lat: number; lon: number; population: number | null }[]> {
  const out: { id: string; name: string; lat: number; lon: number; population: number | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('dtrek_places').select('id, name, latitude, longitude, population')
      .eq('meta_type', metaType).range(from, from + 999)
    if (error) throw error
    for (const r of data ?? []) out.push({ id: r.id as string, name: r.name as string, lat: r.latitude as number, lon: r.longitude as number, population: r.population as number | null })
    if (!data || data.length < 1000) break
  }
  return out
}

function printReport(res: RegistryBuilt[]) {
  for (const { built, quality } of res) {
    console.log(`\n${built.config.name} [${built.config.id}]: ${(built.lengthM / 1000).toFixed(1)} km, ${built.tappe.length} tappe (${built.tappeSource}) → ${quality.status.toUpperCase()}`)
    console.log(`  ufficiali ${quality.officialTappe}, calcolate ${quality.computedTappe}, con nomi da/a ${Math.round(quality.namedShare * 100)}%, più lunga ${quality.maxTappaKm} km`)
    if (quality.reasons.length > 0) console.log(`  da rivedere: ${quality.reasons.join('; ')}`)
    for (const t of built.tappe) {
      console.log(`  ${String(t.ordinal).padStart(3)}. ${(t.lengthM / 1000).toFixed(1).padStart(5)} km  ${t.source === 'official' ? 'uff' : 'calc'}  ${t.fromName ?? '?'} → ${t.toName ?? '?'}${t.name && !/^Tappa \d+$/.test(t.name) ? `  [${t.name.slice(0, 50)}]` : ''}`)
    }
  }
}

interface Ctx {
  supabase: SupabaseClient
  anchors: TappaAnchor[]
  isItalian: (lat: number, lon: number) => boolean
  write: boolean
  minStatus: string
  fixture?: string
  saveFixture?: string
}

/** Scarica (o rilegge), costruisce, controlla e — con write — scrive un cammino. Una riga per cammino costruito (la Francigena ne dà due). */
async function processEntry(entry: RegistryEntry, ctx: Ctx): Promise<RunRow[]> {
  const t0 = Date.now()
  let relations: OverpassRelation[]
  let ways = new Map<number, WayGeometry>()
  if (ctx.fixture) {
    const raw = JSON.parse(fs.readFileSync(ctx.fixture, 'utf8')) as { relations: OverpassRelation[]; ways: [number, WayGeometry][] }
    relations = raw.relations
    raw.ways.forEach(([wid, g]) => ways.set(wid, g))
  } else {
    ({ relations, ways } = await downloadCammino(entry))
    if (ctx.saveFixture) fs.writeFileSync(ctx.saveFixture, JSON.stringify({ relations, ways: Array.from(ways.entries()) }))
  }

  const res = buildFromRegistry(entry, relations, ways, ctx.anchors, { isItalian: ctx.isItalian })
  res[0].built.diagnostics.forEach(d => console.log(`  · ${d}`))
  printReport(res)

  const rows: RunRow[] = []
  for (const r of res) {
    const base = { id: r.built.config.id, name: r.built.config.name, km: r.built.lengthM / 1000, tappe: r.built.tappe.length }
    const reasons = r.quality.reasons.join('; ')
    if (!ctx.write) { rows.push({ ...base, outcome: r.quality.status === 'pronto' ? 'pronto' : 'da_rivedere', detail: reasons, durationS: (Date.now() - t0) / 1000 }); continue }
    if (ctx.minStatus === 'pronto' && r.quality.status !== 'pronto') {
      console.log(`\nSALTATO ${base.id}: stato ${r.quality.status} (${reasons}). Usa --min-status da_rivedere per scriverlo comunque.`)
      rows.push({ ...base, outcome: 'da_rivedere', detail: reasons, durationS: (Date.now() - t0) / 1000 })
      continue
    }
    const stats = await importCammino(ctx.supabase, r.built)
    console.log(`\nSCRITTO ${base.id}: ${JSON.stringify(stats)}`)
    rows.push({ ...base, outcome: 'scritto', detail: `${stats.tappeWritten} tappe scritte, ${stats.tappeRemoved} rimosse`, durationS: (Date.now() - t0) / 1000 })
  }
  return rows
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const idArg = arg('id')
  if (!idArg) { console.error('Manca --id (id, nome, "tutti" o "ondata-N").'); process.exit(1) }
  const multi = isMultiSelector(idArg)
  let queue: RegistryEntry[]
  const rows: RunRow[] = []
  if (multi) {
    const sel = selectEntries(idArg)
    if ('error' in sel) { console.error(sel.error); process.exit(1) }
    queue = sel.selected
    for (const s of sel.skipped) rows.push({ id: s.entry.id, name: s.entry.name, outcome: 'saltato', detail: s.reason })
  } else {
    const r = resolveRegistryEntry(idArg)
    if (!r.ok) { console.error(r.error); process.exit(1) }
    if (r.entry.anchors === 'rifugi') { console.error(`${r.entry.name}: le tappe in rifugio (ondata 3) non sono ancora supportate.`); process.exit(1) }
    queue = [r.entry]
  }
  const write = process.argv.includes('--write')
  const pauseMs = Number(arg('pause-s') ?? 20) * 1000
  const deadline = Date.now() + Number(arg('deadline-min') ?? 330) * 60_000

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Servono SUPABASE_URL e SUPABASE_SERVICE_KEY (comuni del catalogo: filtro Italia e punti di sosta).'); process.exit(1) }
  const supabase = createClient(url, key)
  const borghi = await loadPoints(supabase, 'borgo_citta')
  console.log(`${borghi.length} borghi/città nel catalogo.`)
  const nearestKm = buildNearestFinder(borghi)
  const ctx: Ctx = {
    supabase, write, minStatus: arg('min-status') ?? 'pronto',
    anchors: borghi.map(b => ({ id: b.id, name: b.name, lat: b.lat, lon: b.lon, population: b.population })),
    isItalian: (lat, lon) => nearestKm(lat, lon) <= NEAR_ITALY_KM,
    fixture: arg('fixture'), saveFixture: arg('save-fixture'),
  }

  // Un cammino che cade non ferma gli altri; i falliti si riprovano una volta in coda (la cache su disco
  // fa ripartire il download da dove era arrivato).
  const failed: RegistryEntry[] = []
  const run = async (entry: RegistryEntry, label: string): Promise<boolean> => {
    console.log(`\n━━━ ${label}: ${entry.name} [${entry.id}] ━━━`)
    const t0 = Date.now()
    try { rows.push(...await processEntry(entry, ctx)); return true }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`ERRORE ${entry.id}: ${msg}`)
      rows.push({ id: entry.id, name: entry.name, outcome: 'errore', detail: msg, durationS: (Date.now() - t0) / 1000 })
      return false
    }
  }
  const outOfTime = (entry: RegistryEntry) => {
    if (Date.now() < deadline) return false
    rows.push({ id: entry.id, name: entry.name, outcome: 'rimandato', detail: 'tempo del job esaurito: rilancia, la cache riparte da qui' })
    return true
  }
  for (const [i, entry] of queue.entries()) {
    if (outOfTime(entry)) continue
    if (!(await run(entry, `${i + 1}/${queue.length}`))) failed.push(entry)
    if (i < queue.length - 1) await sleep(pauseMs)
  }
  for (const entry of failed) {
    if (Date.now() >= deadline) break
    await sleep(pauseMs)
    // Il riuso della riga d'errore: la rimpiazza solo se il secondo tentativo riesce.
    const errIdx = rows.findIndex(r => r.id === entry.id && r.outcome === 'errore')
    const before = rows.length
    if (await run(entry, 'secondo tentativo')) rows.splice(errIdx, 1)
    else rows.splice(before, 1) // tiene l'errore del primo tentativo; il secondo è già nel log
  }

  if (!write) console.log('\n[DRY RUN] Nessuna scrittura.')
  const title = `Import cammini del registro (${write ? 'write' : 'dry-run'}) — ${idArg}`
  const md = summaryMarkdown(rows, title)
  console.log(`\n${md}`)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
  process.exit(exitCodeFor(rows))
}

const isDirectRun = process.argv[1]?.endsWith('import-registry.ts') && process.argv[1]?.includes('cammini')
if (isDirectRun) main().catch(err => { console.error(err); process.exit(1) })
