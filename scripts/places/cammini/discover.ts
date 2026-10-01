import fs from 'fs'
import path from 'path'
import { evaluateAll, summarize, type DiscoveryOverrides, type DiscoveryRelation, type DiscoveryResult } from '../../../lib/cammini/discovery'
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
out body;`
}

interface RawRelation {
  type: string
  id: number
  tags?: Record<string, string>
  members?: { type: string; ref: number }[]
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
    })
  }
  return [...seen.values()]
}

export function toMarkdown(results: DiscoveryResult[]): string {
  const counts = summarize(results)
  const row = (r: DiscoveryResult) =>
    `| ${r.name.replace(/\|/g, '/')} | [${r.id}](https://www.openstreetmap.org/relation/${r.id}) | ${r.network ?? ''} | ${r.declaredKm != null ? Math.round(r.declaredKm) : '?'} | ${r.childCount} | ${r.wayMembers} | ${r.score} | ${r.kind} |`
  const head = '| Nome | Relazione | Rete | Km dichiarati | Figli | Way | Punti | Tipo |\n|---|---|---|---|---|---|---|---|'
  const section = (title: string, list: DiscoveryResult[], max: number) =>
    `\n### ${title} (${list.length})\n\n${list.length ? `${head}\n${list.slice(0, max).map(row).join('\n')}${list.length > max ? `\n\n…e altri ${list.length - max} (vedi il JSON)` : ''}` : '_nessuno_'}\n`
  return [
    `## Scoperta cammini — ${results.length} relazioni valutate`,
    `Ammessi **${counts.ammesso}**, da rivedere **${counts.da_rivedere}**, scartati **${counts.scartato}**.`,
    section('Ammessi', results.filter(r => r.verdict === 'ammesso'), 200),
    section('Da rivedere', results.filter(r => r.verdict === 'da_rivedere'), 100),
  ].join('\n')
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

  const out = arg('out') ?? '/tmp/cammini-candidates.json'
  fs.writeFileSync(out, JSON.stringify(results, null, 1))
  const md = toMarkdown(results)
  fs.writeFileSync(arg('md') ?? '/tmp/cammini-candidates.md', md)
  console.log(md)
}

const isDirectRun = process.argv[1]?.endsWith('discover.ts') && process.argv[1]?.includes('cammini')
if (isDirectRun) main().catch(err => { console.error(err); process.exit(1) })
