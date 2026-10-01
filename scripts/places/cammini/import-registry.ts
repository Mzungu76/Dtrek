import fs from 'fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { familyKey } from '../../../lib/cammini/discovery'
import { buildNearestFinder } from '../../../lib/cammini/geoFilter'
import { REGISTRY, type RegistryEntry } from '../../../lib/cammini/registry'
import type { TappaAnchor } from '../../../lib/cammini/tappe'
import type { OverpassRelation } from './build'
import { buildFromRegistry, type RegistryBuilt, type WayGeometry } from './buildRegistry'
import { importCammino } from './import'
import { runOverpass } from './overpass'

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

const NEAR_ITALY_KM = 25
const WAY_CHUNK = 250

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const escapeRe = (n: string) => n.replace(/[\\"^$.*+?()[\]{}|]/g, m => `\\${m}`)

export function relationsQuery(entry: RegistryEntry): string {
  return `[out:json][timeout:180];
rel["type"="route"]["route"~"^(hiking|foot)$"]["name"~"${escapeRe(entry.searchName ?? entry.name)}",i]->.named;
rel(r.named)["route"~"^(hiking|foot)$"]->.kids;
rel(r.kids)["route"~"^(hiking|foot)$"]->.grandkids;
(.named; .kids; .grandkids;);
out body center;`
}

export function waysQuery(ids: number[]): string {
  return `[out:json][timeout:180];
way(id:${ids.join(',')});
out geom;`
}

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

async function main() {
  const id = arg('id')
  const entry = REGISTRY.find(e => e.id === id)
  if (!entry) { console.error(`Cammino sconosciuto: ${id}. Disponibili: ${REGISTRY.map(e => e.id).join(', ')}`); process.exit(1) }
  if (entry.anchors === 'rifugi') { console.error(`${entry.name}: le tappe in rifugio (ondata 3) non sono ancora supportate.`); process.exit(1) }
  const WRITE = process.argv.includes('--write')

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Servono SUPABASE_URL e SUPABASE_SERVICE_KEY (comuni del catalogo: filtro Italia e punti di sosta).'); process.exit(1) }
  const supabase = createClient(url, key)
  const borghi = await loadPoints(supabase, 'borgo_citta')
  console.log(`${borghi.length} borghi/città nel catalogo.`)
  const nearestKm = buildNearestFinder(borghi)
  const isItalian = (lat: number, lon: number) => nearestKm(lat, lon) <= NEAR_ITALY_KM

  let relations: OverpassRelation[]
  const ways = new Map<number, WayGeometry>()
  const fixture = arg('fixture')
  if (fixture) {
    const raw = JSON.parse(fs.readFileSync(fixture, 'utf8')) as { relations: OverpassRelation[]; ways: [number, WayGeometry][] }
    relations = raw.relations
    raw.ways.forEach(([wid, g]) => ways.set(wid, g))
  } else {
    const json = await runOverpass<{ elements?: (OverpassRelation & { center?: { lat: number; lon: number } })[] }>(relationsQuery(entry))
    const all = (json.elements ?? []).filter(e => e.type === 'relation')
    // Taglia subito i pezzi esteri col centro (le tappe senza centro restano: le giudica la geometria).
    relations = all.filter(r => !r.center || isItalian(r.center.lat, r.center.lon) || !r.tags?.name || !entry.match.test(familyKey(r.tags.name)))
    console.log(`${all.length} relazioni scaricate, ${relations.length} dopo il filtro Italia sul centro.`)
    const wayIds = Array.from(new Set(relations.flatMap(r => (r.members ?? []).filter(m => m.type === 'way').map(m => m.ref))))
    console.log(`${wayIds.length} way da scaricare in blocchi da ${WAY_CHUNK}…`)
    for (let i = 0; i < wayIds.length; i += WAY_CHUNK) {
      const chunk = wayIds.slice(i, i + WAY_CHUNK)
      const wj = await runOverpass<{ elements?: { type: string; id: number; geometry?: WayGeometry }[] }>(waysQuery(chunk))
      for (const e of wj.elements ?? []) if (e.type === 'way' && e.geometry) ways.set(e.id, e.geometry)
      console.log(`  way ${Math.min(i + WAY_CHUNK, wayIds.length)}/${wayIds.length}`)
    }
    const saveFixture = arg('save-fixture')
    if (saveFixture) fs.writeFileSync(saveFixture, JSON.stringify({ relations, ways: Array.from(ways.entries()) }))
  }

  const anchors: TappaAnchor[] = borghi.map(b => ({ id: b.id, name: b.name, lat: b.lat, lon: b.lon, population: b.population }))
  const res = buildFromRegistry(entry, relations, ways, anchors, { isItalian })
  res[0].built.diagnostics.forEach(d => console.log(`  · ${d}`))
  printReport(res)

  if (!WRITE) { console.log('\n[DRY RUN] Nessuna scrittura.'); return }
  const minStatus = arg('min-status') ?? 'pronto'
  for (const r of res) {
    if (minStatus === 'pronto' && r.quality.status !== 'pronto') {
      console.log(`\nSALTATO ${r.built.config.id}: stato ${r.quality.status} (${r.quality.reasons.join('; ')}). Usa --min-status da_rivedere per scriverlo comunque.`)
      continue
    }
    const stats = await importCammino(supabase, r.built)
    console.log(`\nSCRITTO ${r.built.config.id}: ${JSON.stringify(stats)}`)
  }
}

const isDirectRun = process.argv[1]?.endsWith('import-registry.ts') && process.argv[1]?.includes('cammini')
if (isDirectRun) main().catch(err => { console.error(err); process.exit(1) })
