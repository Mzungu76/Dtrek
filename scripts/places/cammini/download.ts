import fs from 'fs'
import path from 'path'
import { chunk, missingIds } from '../../../lib/cammini/overpassPlan'
import type { RegistryEntry } from '../../../lib/cammini/registry'
import type { OverpassRelation } from './build'
import type { WayGeometry } from './buildRegistry'
import { relationsByIdQuery, italyQuery, rootsQuery, waysQuery } from '../../../lib/cammini/overpassQueries'
import { runOverpass } from './overpass'

export { rootsQuery, relationsByIdQuery, italyQuery, waysQuery }

// Download a stadi di un cammino da Overpass, con cache su disco per cammino ripresa all'avvio:
//   A. relazioni radice col nome (solo tag e membri, niente geometria) in tutto il mondo
//   B. sotto-relazioni per id a blocchi (anche qui tag e membri), fino a MAX_DEPTH livelli
//   C. quali relazioni con tracciato toccano l'Italia (bbox, solo id): le altre si scartano
//   D. geometria delle way, a blocchi
// Dopo ogni blocco la cache viene riscritta: un 504 o un run interrotto riparte da lì.

const REL_CHUNK = 400
const WAY_CHUNK = 250
const MAX_DEPTH = 4

interface Cache {
  version: 1
  roots?: number[]
  relations: Record<string, OverpassRelation>
  /** Id richiesti ma non restituiti (cancellati/non route): non si richiedono di nuovo. */
  gone: number[]
  /** Relazioni con tracciato: vero se toccano il bbox Italia. */
  italy: Record<string, boolean>
  ways: Record<string, WayGeometry>
}

export const cacheDir = () => process.env.CAMMINI_CACHE_DIR ?? '.cache/cammini'

function loadCache(file: string): Cache {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8')) as Cache
    if (c.version === 1) return c
  } catch { /* nessuna cache o file rovinato: si riparte */ }
  return { version: 1, relations: {}, gone: [], italy: {}, ways: {} }
}
function saveCache(file: string, c: Cache) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(c))
  fs.renameSync(`${file}.tmp`, file)
}

const wayRefs = (r: OverpassRelation) => (r.members ?? []).filter(m => m.type === 'way').map(m => m.ref)
const relRefs = (r: OverpassRelation) => (r.members ?? []).filter(m => m.type === 'relation').map(m => m.ref)

export interface Downloaded { relations: OverpassRelation[]; ways: Map<number, WayGeometry> }

export async function downloadCammino(entry: RegistryEntry): Promise<Downloaded> {
  const file = path.join(cacheDir(), `${entry.id}.json`)
  const cache = loadCache(file)
  const resumed = Object.keys(cache.relations).length + Object.keys(cache.ways).length
  if (resumed > 0) console.log(`Cache ripresa: ${Object.keys(cache.relations).length} relazioni, ${Object.keys(cache.ways).length} way.`)
  const gone = new Set(cache.gone)
  const rels = new Map<number, OverpassRelation>(Object.entries(cache.relations).map(([id, r]) => [Number(id), r]))
  const isRoute = (r: OverpassRelation) => ['hiking', 'foot'].includes(r.tags?.route ?? '')

  async function fetchRelations(ids: number[]) {
    const todo = missingIds(ids, id => rels.has(id) || gone.has(id))
    const blocks = chunk(todo, REL_CHUNK)
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const json = await runOverpass<{ elements?: OverpassRelation[] }>(relationsByIdQuery(block))
      const seen = new Set<number>()
      for (const e of json.elements ?? []) if (e.type === 'relation') { rels.set(e.id, e); cache.relations[e.id] = e; seen.add(e.id) }
      for (const id of block) if (!seen.has(id)) { gone.add(id); cache.gone.push(id) }
      saveCache(file, cache)
      console.log(`  relazioni ${i + 1}/${blocks.length} blocchi`)
    }
  }

  // A. radici
  if (!cache.roots) {
    const json = await runOverpass<{ elements?: OverpassRelation[] }>(rootsQuery(entry))
    const found = (json.elements ?? []).filter(e => e.type === 'relation')
    for (const e of found) { rels.set(e.id, e); cache.relations[e.id] = e }
    cache.roots = found.map(e => e.id)
    saveCache(file, cache)
  }
  console.log(`${cache.roots.length} relazioni radice col nome.`)

  // B. sotto-relazioni, un livello alla volta
  let frontier = cache.roots
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth++) {
    const kids = Array.from(new Set(frontier.flatMap(id => relRefs(rels.get(id)!))))
    await fetchRelations(kids)
    frontier = kids.filter(id => { const r = rels.get(id); return r && isRoute(r) })
    console.log(`livello ${depth}: ${kids.length} sotto-relazioni, ${frontier.length} da seguire.`)
  }

  const all = Array.from(rels.values()).filter(isRoute)
  // C. solo i tracciati che toccano l'Italia
  const withWays = all.filter(r => wayRefs(r).length > 0)
  const unknown = missingIds(withWays.map(r => r.id), id => id in cache.italy)
  for (const block of chunk(unknown, REL_CHUNK)) {
    const json = await runOverpass<{ elements?: { id: number }[] }>(italyQuery(block))
    const inside = new Set((json.elements ?? []).map(e => e.id))
    for (const id of block) cache.italy[id] = inside.has(id)
    saveCache(file, cache)
  }
  const relations = all.filter(r => wayRefs(r).length === 0 || cache.italy[r.id])
  console.log(`${all.length} relazioni route, ${relations.length} dopo il filtro Italia (bbox).`)

  // D. geometria
  const wayIds = Array.from(new Set(relations.flatMap(wayRefs)))
  const todoWays = missingIds(wayIds, id => String(id) in cache.ways)
  console.log(`${wayIds.length} way (${todoWays.length} da scaricare, blocchi da ${WAY_CHUNK})…`)
  const blocks = chunk(todoWays, WAY_CHUNK)
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    const wj = await runOverpass<{ elements?: { type: string; id: number; geometry?: WayGeometry }[] }>(waysQuery(block))
    for (const e of wj.elements ?? []) if (e.type === 'way' && e.geometry) cache.ways[e.id] = e.geometry
    // Way senza geometria (cancellate): segnate vuote per non richiederle a ogni giro.
    for (const id of block) if (!(String(id) in cache.ways)) cache.ways[id] = []
    saveCache(file, cache)
    console.log(`  way ${i + 1}/${blocks.length} blocchi`)
  }

  const ways = new Map<number, WayGeometry>()
  for (const id of wayIds) ways.set(id, cache.ways[id] ?? [])
  return { relations, ways }
}
