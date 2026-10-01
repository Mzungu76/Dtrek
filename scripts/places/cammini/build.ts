import { clipToBbox, orientLine, polylineLengthM, simplifyPolyline, stitchWays, type LatLon } from '../../../lib/cammini/geometry'
import {
  parseTappaEndpoints, parseTappaNumber, simplifyTappa, splitIntoTappe,
  type SplitOptions, type TappaAnchor, type TappaDraft,
} from '../../../lib/cammini/tappe'
import type { PlaceCandidate } from '../types'
import type { CamminoConfig } from './config'

// Da JSON Overpass (`out geom`) a un Cammino con le sue tappe — logica pura, testata su fixture
// (scripts/places/__tests__/cammini.test.ts): nessuna rete qui, quella sta in fetch.ts.

export interface OverpassMember {
  type: 'way' | 'node' | 'relation'
  ref: number
  role?: string
  geometry?: ({ lat: number; lon: number } | null)[]
}

export interface OverpassRelation {
  type: 'relation'
  id: number
  tags?: Record<string, string>
  members?: OverpassMember[]
}

/** Way top-level con geometria (la query leggera le emette a parte dalle relazioni). */
export interface OverpassWay {
  type: 'way'
  id: number
  geometry?: ({ lat: number; lon: number } | null)[]
}

export type OverpassElement = OverpassRelation | OverpassWay

export type StagesMode = 'auto' | 'official' | 'computed'

export interface BuiltCammino {
  config: CamminoConfig
  /** Come sono state ottenute le tappe — la UI/le guide non devono presentare come "ufficiali"
   *  tappe che abbiamo calcolato noi. */
  tappeSource: 'official' | 'computed'
  line: LatLon[]
  lengthM: number
  tappe: TappaDraft[]
  relationIds: number[]
  tags: Record<string, string>
  diagnostics: string[]
}

const ROUTE_OK = new Set(['hiking', 'foot'])

function isWalkingRoute(r: OverpassRelation): boolean {
  return ROUTE_OK.has(r.tags?.route ?? '')
}

type WayLookup = Map<number, ({ lat: number; lon: number } | null)[]>

function relationWays(r: OverpassRelation, lookup: WayLookup): { ref: number; points: LatLon[] }[] {
  const out: { ref: number; points: LatLon[] }[] = []
  for (const m of r.members ?? []) {
    const geometry = m.type === 'way' ? (m.geometry ?? lookup.get(m.ref)) : undefined
    if (!geometry) continue
    const points = geometry.filter((p): p is { lat: number; lon: number } => !!p).map(p => [p.lat, p.lon] as LatLon)
    if (points.length >= 2) out.push({ ref: m.ref, points })
  }
  return out
}

function chainsInBbox(ways: LatLon[][], config: CamminoConfig): LatLon[][] {
  return stitchWays(ways.flatMap(w => clipToBbox(w, config.bbox)))
}

function longestChain(chains: LatLon[][]): LatLon[] {
  return chains.reduce<LatLon[]>((best, c) => (polylineLengthM(c) > polylineLengthM(best) ? c : best), [])
}

function buildOfficialTappe(stages: { number: number; rel: OverpassRelation }[], config: CamminoConfig, lookup: WayLookup, diagnostics: string[]): TappaDraft[] {
  const tappe: TappaDraft[] = []
  let previousEnd: { lat: number; lon: number } = config.start
  for (const { number, rel } of stages.sort((a, b) => a.number - b.number)) {
    const chains = chainsInBbox(relationWays(rel, lookup).map(w => w.points), config)
    const line = longestChain(chains)
    if (line.length < 2) { diagnostics.push(`Tappa ${number} (rel ${rel.id}): nessun tratto dentro il ritaglio, scartata.`); continue }
    if (chains.length > 1) diagnostics.push(`Tappa ${number} (rel ${rel.id}): ${chains.length} tratti non connessi, tenuto il più lungo.`)
    const oriented = orientLine(line, previousEnd)
    previousEnd = { lat: oriented[oriented.length - 1][0], lon: oriented[oriented.length - 1][1] }
    const endpoints = parseTappaEndpoints(rel.tags?.name)
    tappe.push({
      ordinal: tappe.length + 1,
      name: rel.tags?.name ?? `Tappa ${number}`,
      fromName: endpoints?.from,
      toName: endpoints?.to,
      lengthM: polylineLengthM(oriented),
      polyline: oriented,
      source: 'official',
      officialRelationId: rel.id,
    })
  }
  return tappe
}

export function buildCammino(
  rawElements: OverpassElement[],
  config: CamminoConfig,
  anchors: TappaAnchor[],
  options: { stages?: StagesMode; split?: Partial<SplitOptions> } = {},
): BuiltCammino {
  const mode = options.stages ?? 'auto'
  const diagnostics: string[] = []
  const nameRe = new RegExp(config.nameRegex, 'i')
  const excludeRe = config.excludeNameRegex ? new RegExp(config.excludeNameRegex, 'i') : null

  const elements = rawElements.filter((e): e is OverpassRelation => e.type === 'relation')
  const lookup: WayLookup = new Map()
  for (const e of rawElements) if (e.type === 'way' && e.geometry) lookup.set(e.id, e.geometry)
  diagnostics.push(`Elementi: ${elements.length} relazioni, ${lookup.size} way con geometria.`)

  const walking = elements.filter(r => isWalkingRoute(r))
  const byId = new Map(walking.map(r => [r.id, r]))
  const matched = walking.filter(r => r.tags?.name && nameRe.test(r.tags.name) && !(excludeRe && excludeRe.test(r.tags.name)))
  diagnostics.push(`Relazioni a piedi: ${walking.length}, con il nome del cammino: ${matched.length}.`)
  if (matched.length === 0) throw new Error(`Nessuna relazione OSM a piedi con nome /${config.nameRegex}/ nel ritaglio.`)

  // Sotto-relazioni (tappe) dei match, anche se il loro nome non contiene quello del cammino.
  const childIds = new Set<number>()
  for (const r of matched) for (const m of r.members ?? []) if (m.type === 'relation' && byId.has(m.ref)) childIds.add(m.ref)
  const children = [...childIds].map(id => byId.get(id)!).filter(r => relationWays(r, lookup).length > 0)

  const numbered = new Map<number, OverpassRelation>()
  for (const r of [...matched, ...children]) {
    const n = parseTappaNumber(r.tags?.name, r.tags?.ref)
    if (n == null || relationWays(r, lookup).length === 0) continue
    const prev = numbered.get(n)
    if (!prev || relationWays(r, lookup).length > relationWays(prev, lookup).length) numbered.set(n, r)
  }
  const officialStages = [...numbered.entries()].map(([number, rel]) => ({ number, rel }))
  diagnostics.push(`Tappe numerate trovate: ${officialStages.length}.`)

  let tappe: TappaDraft[] = []
  let line: LatLon[] = []
  let tappeSource: 'official' | 'computed' = 'computed'

  if (mode !== 'computed' && officialStages.length >= 3) {
    tappe = buildOfficialTappe(officialStages, config, lookup, diagnostics)
    line = tappe.flatMap((t, i) => (i === 0 ? t.polyline : t.polyline.slice(1)))
    tappeSource = 'official'
  } else {
    if (mode === 'official') throw new Error('Modalità official richiesta ma ci sono meno di 3 tappe numerate.')
    const seen = new Map<number, LatLon[]>()
    for (const r of matched) for (const w of relationWays(r, lookup)) seen.set(w.ref, w.points)
    const chains = chainsInBbox([...seen.values()], config)
    diagnostics.push(`Way uniche: ${seen.size}, catene connesse: ${chains.length}.`)
    line = orientLine(longestChain(chains), config.start)
    const dropped = chains.filter(c => c !== longestChain(chains))
    if (dropped.length > 0) {
      diagnostics.push(`Scartate ${dropped.length} catene minori (varianti o interruzioni): ${dropped.map(c => `${Math.round(polylineLengthM(c) / 1000)} km`).join(', ')}.`)
    }
    tappe = splitIntoTappe(line, anchors, options.split)
  }
  if (line.length < 2) throw new Error('Linea del cammino vuota dopo il ritaglio.')

  const tags: Record<string, string> = {}
  for (const r of matched) for (const [k, v] of Object.entries(r.tags ?? {})) if (!(k in tags)) tags[k] = v

  return {
    config, tappeSource, line, lengthM: polylineLengthM(line),
    tappe: tappe.map(t => simplifyTappa(t, 15)),
    relationIds: matched.map(r => r.id),
    tags, diagnostics,
  }
}

// Punto del cammino a metà della sua lunghezza — è il pin in mappa e la coordinata di ricerca.
function midpoint(line: LatLon[]): LatLon {
  const half = polylineLengthM(line) / 2
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    const seg = polylineLengthM([line[i - 1], line[i]])
    if (acc + seg >= half) return line[i]
    acc += seg
  }
  return line[line.length - 1]
}

export function camminoToPlaceCandidate(built: BuiltCammino): PlaceCandidate {
  const { config, tags } = built
  const [lat, lon] = midpoint(built.line)
  return {
    name: config.name,
    metaType: 'cammino',
    description: tags['description:it'] ?? tags.description ?? config.description,
    latitude: lat,
    longitude: lon,
    region: config.region,
    officialUrl: tags.website ?? tags.url,
    source: 'osm',
    sourceId: `cammino/${config.id}`,
    rawType: 'route=hiking',
    // Tappe ufficiali = struttura data dalla fonte; calcolate = nostra stima, meno affidabile.
    confidence: built.tappeSource === 'official' ? 0.9 : 0.75,
    metadata: {
      kind: 'cammino',
      theme: config.theme,
      lengthM: Math.round(built.lengthM),
      tappeCount: built.tappe.length,
      tappeSource: built.tappeSource,
      osmRelationIds: built.relationIds,
      start: config.start,
      end: config.end,
      ref: tags.ref ?? null,
      network: tags.network ?? null,
      // Panoramica per la mappa: formato [lat, lon][] come routePolyline, già semplificata.
      overviewPolyline: simplifyPolyline(built.line, 150),
    },
  }
}
