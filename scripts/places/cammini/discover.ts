import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { applyCountryCheck, evaluateAll, groupFamilies, summarize, type DiscoveryFamily, type DiscoveryOverrides, type DiscoveryRelation, type DiscoveryResult } from '../../../lib/cammini/discovery'
import { buildNearestFinder } from '../../../lib/cammini/geoFilter'
import { runOverpass } from './overpass'

// Scoperta nazionale dei cammini (docs/piano-cammini.md): una query leggera per fascia di latitudine
// (relazioni con i soli tag e l'elenco dei membri, nessuna geometria) e la valutazione automatica di
// lib/cammini/discovery.ts. Non scrive nulla in database: produce la lista dei candidati, da cui si
// sceglie cosa importare. Solo route=hiking|foot — i cammini ciclabili sono esclusi per decisione
// di prodotto.
//
// Uso:
//   npx tsx scripts/places/cammini/discover.ts [--out /tmp/cammini-candidates.json] [--md /tmp/cammini-candidates.md]
//   npx tsx scripts/places/cammini/discover.ts --fixture /tmp/raw-discovery.json   (rifà la valutazione offline)
//   --save-fixture <file> salva la risposta Overpass grezza

// Fasce di latitudine che coprono l'Italia (isole comprese): query più piccole = meno timeout.
const BANDS: [number, number][] = [[35.2, 38.4], [38.4, 41.2], [41.2, 43.8], [43.8, 47.2]]
const WEST = 6.4, EAST = 18.8

export function discoveryQuery(south: number, north: number): string {
  const bbox = `${south},${WEST},${north},${EAST}`
  return `[out:json][timeout:180][maxsize:536870912];
(
  rel["type"="route"]["route"~"^(hiking|foot)$"]["network"~"^(iwn|nwn)$"](${bbox});
  rel["type"="route"]["route"~"^(hiking|foot)$"]["network"="rwn"]["name"~"^(Cammino|Via |Alta Via|Sentiero|Romea|Francigena)",i](${bbox});
);
out body center;`
}

interface RawRelation {
  type: string
  id: number
  tags?: Record<string, string>
  members?: { type: string; ref: number }[]
  center?: { lat: number; lon: number }
}

export function toDiscoveryRelations(elements: RawRelation[]): DiscoveryRelation[] {
  const seen = new Map<number, DiscoveryRelation>()
  for (const e of elements) {
    if (e.type !== 'relation' || seen.has(e.id)) continue
    const members = e.members ?? []
    seen.set(e.id, {
      id: e.id,
      tags: e.tags ?? {},
      wayMembers: members.filter(m => m.type === 'way').length,
      childIds: members.filter(m => m.type === 'relation').map(m => m.ref),
      center: e.center,
    })
  }
  return [...seen.values()]
}

export function toMarkdown(results: DiscoveryResult[], families: DiscoveryFamily[]): string {
  const counts = summarize(results)
  const famCounts = { ammesso: 0, da_rivedere: 0, scartato: 0 }
  for (const f of families) famCounts[f.verdict]++
  const row = (f: DiscoveryFamily) =>
    `| ${f.name.replace(/\|/g, '/')} | ${f.networks.join('/') || '-'} | ${f.declaredKm != null ? Math.round(f.declaredKm) : '?'} | ${f.members} | ${f.stageRelations} | ${f.childRelations} | ${f.inItaly} | ${f.score} | ${f.relationIds.slice(0, 3).map(id => `[${id}](https://www.openstreetmap.org/relation/${id})`).join(' ')}${f.relationIds.length > 3 ? ' …' : ''} |`
  const head = '| Cammino | Rete | Km dichiarati | Relazioni | di cui tappe | Figli | In Italia | Punti | Relazioni OSM |\n|---|---|---|---|---|---|---|---|---|'
  const section = (title: string, list: DiscoveryFamily[], max: number) =>
    `\n### ${title} (${list.length})\n\n${list.length ? `${head}\n${list.slice(0, max).map(row).join('\n')}${list.length > max ? `\n\n…e altri ${list.length - max} (vedi il JSON)` : ''}` : '_nessuno_'}\n`
  return [
    `## Scoperta cammini — ${results.length} relazioni valutate, ${families.length} cammini (famiglie)`,
    `Cammini: ammessi **${famCounts.ammesso}**, da rivedere **${famCounts.da_rivedere}**, scartati **${famCounts.scartato}**. Relazioni: ammesse ${counts.ammesso}, da rivedere ${counts.da_rivedere}, scartate ${counts.scartato}.`,
    section('Cammini ammessi', families.filter(f => f.verdict === 'ammesso'), 150),
    section('Cammini da rivedere', families.filter(f => f.verdict === 'da_rivedere'), 100),
  ].join('\n')
}

// Comuni italiani del catalogo (dtrek_places, borgo_citta): servono a capire se il centro di una
// relazione è in Italia. Senza credenziali Supabase il controllo si salta e lo si dichiara.
async function loadItalianPoints(): Promise<{ lat: number; lon: number }[] | null> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const supabase = createClient(url, key)
  const points: { lat: number; lon: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('dtrek_places').select('latitude, longitude')
      .eq('meta_type', 'borgo_citta').range(from, from + 999)
    if (error) throw error
    for (const r of data ?? []) points.push({ lat: r.latitude as number, lon: r.longitude as number })
    if (!data || data.length < 1000) break
  }
  return points.length > 0 ? points : null
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const fixture = arg('fixture')
  let elements: RawRelation[]
  if (fixture) {
    elements = JSON.parse(fs.readFileSync(fixture, 'utf8')).elements as RawRelation[]
  } else {
    elements = []
    for (const [s, n] of BANDS) {
      console.log(`Fascia ${s}–${n}°N…`)
      const json = await runOverpass<{ elements?: RawRelation[] }>(discoveryQuery(s, n))
      console.log(`  ${json.elements?.length ?? 0} relazioni`)
      elements.push(...(json.elements ?? []))
    }
    const saveFixture = arg('save-fixture')
    if (saveFixture) fs.writeFileSync(saveFixture, JSON.stringify({ elements }))
  }

  const overridesPath = path.join(process.cwd(), 'scripts', 'places', 'cammini', 'overrides.json')
  const overrides: DiscoveryOverrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
  const results = evaluateAll(toDiscoveryRelations(elements), overrides)

  const italian = await loadItalianPoints()
  if (italian) {
    console.log(`Controllo Italia con ${italian.length} comuni del catalogo.`)
    applyCountryCheck(results, buildNearestFinder(italian))
  } else {
    console.warn('Nessuna credenziale Supabase (o catalogo vuoto): controllo "in Italia" saltato, i cammini esteri NON sono filtrati.')
  }
  const families = groupFamilies(results)

  const out = arg('out') ?? '/tmp/cammini-candidates.json'
  fs.writeFileSync(out, JSON.stringify({ families, relations: results }, null, 1))
  const md = toMarkdown(results, families)
  fs.writeFileSync(arg('md') ?? '/tmp/cammini-candidates.md', md)
  console.log(md)
}

const isDirectRun = process.argv[1]?.endsWith('discover.ts') && process.argv[1]?.includes('cammini')
if (isDirectRun) main().catch(err => { console.error(err); process.exit(1) })
