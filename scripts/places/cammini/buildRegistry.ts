import { anchorsNearLine, nearestVertex, orderAlongRoute, polylineLengthM, stitchWays, type Bbox, type LatLon } from '../../../lib/cammini/geometry'
import { familyKey } from '../../../lib/cammini/discovery'
import type { RegistryEntry } from '../../../lib/cammini/registry'
import {
  canonicalizeEndpointNames, fillEndpointsFromAnchors, orientNamesByGeometry, parseTappaEndpoints, parseTappaNumber, propagateSharedEndpoints, simplifyTappa, splitIntoTappe,
  type SplitOptions, type TappaAnchor, type TappaDraft,
} from '../../../lib/cammini/tappe'
import type { BuiltCammino, OverpassRelation } from './build'
import type { CamminoConfig } from './config'

// Da un gruppo di relazioni OSM (tutte quelle di un cammino del registro) a uno o due BuiltCammino
// pronti da importare — logica pura, testata su fixture. A differenza di build.ts (un cammino per
// nome e ritaglio), qui il cammino è l'insieme di relazioni scelto dal registro e l'ordine delle
// tappe è quello geometrico, non quello dei numeri (che ripartono da 1 in ogni regione).

export type WayGeometry = ({ lat: number; lon: number } | null)[]

export interface RegistryBuildOptions {
  /** Il punto cade in Italia? (vicino a un comune del catalogo) — scarta i pezzi esteri. */
  isItalian: (lat: number, lon: number) => boolean
  split?: Partial<SplitOptions>
  maxGapM?: number
}

export interface QualityReport {
  status: 'pronto' | 'da_rivedere'
  reasons: string[]
  tappe: number
  totalKm: number
  connected: boolean
  maxTappaKm: number
  longTappe: number
  shortTappe: number
  namedShare: number
  officialTappe: number
  computedTappe: number
}

export interface RegistryBuilt { built: BuiltCammino; quality: QualityReport }

const ITALY_BBOX: Bbox = [35.2, 6.6, 47.1, 18.8]
const STAGE_WORD = /\btappa\b|\bstage\b|\betap[ep]?\b/i
const VARIANT_WORD = /variant|variante|alternativ|deviazione/i
// Una tappa a piedi oltre ~45 km o sotto ~2 km è quasi sempre un errore di dati o di divisione.
const LONG_KM = 45
const SHORT_KM = 2

function wayPoints(geometry: WayGeometry | undefined): LatLon[] {
  return (geometry ?? []).filter((p): p is { lat: number; lon: number } => !!p).map(p => [p.lat, p.lon] as LatLon)
}

function relationWayRefs(r: OverpassRelation): number[] {
  return (r.members ?? []).filter(m => m.type === 'way').map(m => m.ref)
}

function longestChain(chains: LatLon[][]): LatLon[] {
  return chains.reduce<LatLon[]>((best, c) => (polylineLengthM(c) > polylineLengthM(best) ? c : best), [])
}

/** "Cammino di San Benedetto - Tappa 01" → "Tappa 01": il nome del cammino sta già nel cammino. */
export function stageLabel(name: string): string {
  const m = /[-–:]\s*((?:tappa|stage|etap[ep]?)\b.*)$/i.exec(name)
  return (m ? m[1] : name).trim()
}

function midpoint(line: LatLon[]): LatLon {
  return line[Math.floor(line.length / 2)]
}

interface Piece { id: number; name: string; ref?: string; line: LatLon[]; official: boolean; stageNumber: number | null; rel: OverpassRelation; wayRefs: number[] }

export function buildFromRegistry(
  entry: RegistryEntry,
  relations: OverpassRelation[],
  ways: Map<number, WayGeometry>,
  anchorsAll: TappaAnchor[],
  opts: RegistryBuildOptions,
): RegistryBuilt[] {
  const diagnostics: string[] = []
  const rels = relations.filter(r => r.type === 'relation' && ['hiking', 'foot'].includes(r.tags?.route ?? ''))
  const byId = new Map(rels.map(r => [r.id, r]))
  const inSet = (id: number) => byId.has(id)

  // Pezzi del cammino: relazioni col nome giusto + le loro sotto-relazioni (tappe, anche con altro nome).
  const named = rels.filter(r => r.tags?.name && entry.match.test(familyKey(r.tags.name)))
  const ids = new Set<number>(named.map(r => r.id))
  const queue = [...named]
  while (queue.length > 0) {
    const r = queue.pop()!
    for (const m of r.members ?? []) {
      if (m.type === 'relation' && inSet(m.ref) && !ids.has(m.ref)) { ids.add(m.ref); queue.push(byId.get(m.ref)!) }
    }
  }
  const members = rels.filter(r => ids.has(r.id))
  diagnostics.push(`Relazioni del gruppo: ${members.length} (${named.length} per nome, ${members.length - named.length} sotto-relazioni).`)

  // Foglie = relazioni con tracciato proprio e nessuna sotto-relazione nel gruppo.
  const leaves = members.filter(r => relationWayRefs(r).length > 0 && !(r.members ?? []).some(m => m.type === 'relation' && ids.has(m.ref)))
  const parentsWithWays = members.filter(r => relationWayRefs(r).length > 0 && (r.members ?? []).some(m => m.type === 'relation' && ids.has(m.ref)))

  const pieces: Piece[] = []
  let droppedForeign = 0
  for (const r of leaves) {
    const chains = stitchWays(relationWayRefs(r).map(ref => wayPoints(ways.get(ref))).filter(l => l.length >= 2))
    const line = longestChain(chains)
    if (line.length < 2) continue
    const mid = midpoint(line)
    if (!opts.isItalian(mid[0], mid[1])) { droppedForeign++; continue }
    const name = r.tags?.name ?? `relation/${r.id}`
    const stageNumber = parseTappaNumber(r.tags?.name, r.tags?.ref)
    pieces.push({ id: r.id, name, ref: r.tags?.ref, line, official: stageNumber != null || STAGE_WORD.test(name), stageNumber, rel: r, wayRefs: relationWayRefs(r) })
  }
  if (droppedForeign > 0) diagnostics.push(`Scartati ${droppedForeign} pezzi fuori dall'Italia.`)

  const officialPieces = pieces.filter(p => p.official && !VARIANT_WORD.test(p.name))
  const otherPieces = pieces.filter(p => !officialPieces.includes(p))

  // Pezzi non-tappa il cui tracciato è già coperto dalle tappe ufficiali (≥70% delle way): ignorati;
  // gli altri (regioni senza tappe numerate) diventano tappe calcolate.
  const stageWays = new Set(officialPieces.flatMap(p => p.wayRefs))
  const useOfficial = officialPieces.length >= 3
  const toCompute = (useOfficial ? otherPieces : pieces).filter(p => {
    if (VARIANT_WORD.test(p.name)) return false
    if (!useOfficial) return true
    const covered = p.wayRefs.filter(w => stageWays.has(w)).length
    return covered / Math.max(1, p.wayRefs.length) < 0.7
  })
  diagnostics.push(`Tappe ufficiali: ${useOfficial ? officialPieces.length : 0}; pezzi senza tappe da dividere: ${toCompute.length}.`)

  const anchors = (() => {
    const all = pieces.flatMap(p => p.line)
    return all.length > 0 ? anchorsNearLine(all.filter((_, i) => i % 5 === 0), anchorsAll, 3000) : []
  })()

  const items: { line: LatLon[]; tappe: TappaDraft[] }[] = []
  if (useOfficial) {
    for (const p of officialPieces) {
      // Capi: dal nome ("Tappa 3: A - B") o dai tag from/to della relazione (molte tappe li hanno).
      const ep = parseTappaEndpoints(p.rel.tags?.name)
      const fromName = ep?.from ?? (p.rel.tags?.from?.trim() || undefined)
      const toName = ep?.to ?? (p.rel.tags?.to?.trim() || undefined)
      items.push({
        line: p.line,
        tappe: [{
          ordinal: 0, name: stageLabel(p.name), fromName, toName, lengthM: polylineLengthM(p.line),
          polyline: p.line, source: 'official', officialRelationId: p.id,
        }],
      })
    }
  }
  for (const p of toCompute) {
    items.push({ line: p.line, tappe: splitIntoTappe(p.line, anchors, opts.split).map(t => ({ ...t, source: 'computed' as const })) })
  }
  if (items.length === 0) throw new Error(`${entry.name}: nessun tracciato utilizzabile (pezzi: ${pieces.length}, esteri scartati: ${droppedForeign}).`)

  // Ordine geometrico delle tappe, ognuna orientata in continuità con la precedente.
  const flat = items.flatMap(i => i.tappe.map(t => ({ line: t.polyline, tappa: t })))
  const { ordered, leftover } = orderAlongRoute(flat, { maxGapM: opts.maxGapM ?? 3000 })
  if (leftover.length > 0) diagnostics.push(`${leftover.length} tappe non collegate al percorso principale (interruzioni nei dati): escluse.`)
  const tappe: TappaDraft[] = ordered.map((o, i) => ({ ...o.item.tappa, polyline: o.line, ordinal: i + 1 }))
  const gaps = ordered.filter(o => o.gapBeforeM > 500).length
  if (gaps > 0) diagnostics.push(`${gaps} collegamenti fra tappe con salto > 500 m.`)
  // "A - B" è il verso della relazione, non necessariamente quello in cui abbiamo messo in fila la
  // tappa: i capi si orientano confrontando i nomi con la posizione dei paesi, poi coi vicini.
  canonicalizeEndpointNames(tappe, anchorsAll)
  orientNamesByGeometry(tappe, anchorsAll)
  fillEndpointsFromAnchors(tappe, anchors)
  // Un capo ancora senza nome: borghi un po' più lontani (frazioni, passi), poi il nome dell'altro lato
  // della giunzione. Se nessuno lo sa, resta senza nome.
  fillEndpointsFromAnchors(tappe, anchors, 5000)
  propagateSharedEndpoints(tappe)

  // Divisione a un punto (Francigena: Canterbury–Roma / Roma–Leuca).
  const groups: { id: string; name: string; tappe: TappaDraft[] }[] = []
  if (entry.splitAt) {
    const at = entry.splitAt
    const idx = tappe.findIndex(t => nearestVertex(t.polyline, at).distanceM <= 3000)
    if (idx >= 0) {
      const before = tappe.slice(0, idx + 1), after = tappe.slice(idx + 1)
      if (before.length > 0) groups.push({ id: at.before, name: at.before === entry.id ? entry.name : `${entry.name} (${at.before})`, tappe: before })
      if (after.length > 0) groups.push({ id: at.after, name: `${entry.name} del Sud`, tappe: after })
      diagnostics.push(`Diviso a ${at.name}: ${before.length} tappe prima, ${after.length} dopo.`)
    } else {
      diagnostics.push(`Nessuna tappa passa entro 3 km da ${at.name}: cammino non diviso.`)
    }
  }
  if (groups.length === 0) groups.push({ id: entry.id, name: entry.name, tappe })

  const mainTags = (() => {
    const isVariant = (r: OverpassRelation) => VARIANT_WORD.test(`${r.tags?.name ?? ''} ${r.tags?.description ?? ''}`)
    const main = [...named].sort((a, b) => Number(isVariant(a)) - Number(isVariant(b)) || Number(!!b.tags?.website) - Number(!!a.tags?.website))[0]
    return { ...(main?.tags ?? {}) }
  })()

  return groups.map(g => {
    const list = g.tappe.map((t, i) => simplifyTappa({ ...t, ordinal: i + 1 }, 15))
    const line = list.flatMap((t, i) => (i === 0 ? t.polyline : t.polyline.slice(1)))
    const first = line[0], last = line[line.length - 1]
    const official = list.filter(t => t.source === 'official').length
    const config: CamminoConfig = {
      id: g.id, name: g.name, nameRegex: entry.searchName ?? entry.name, region: 'Italia', bbox: ITALY_BBOX,
      start: { name: list[0].fromName ?? '', lat: first[0], lon: first[1] },
      end: { name: list[list.length - 1].toName ?? '', lat: last[0], lon: last[1] },
      theme: entry.theme,
    }
    const quality = assessQuality(list, leftover.length === 0, gaps)
    const built: BuiltCammino = {
      config, line, lengthM: polylineLengthM(line), tappe: list,
      tappeSource: official === list.length ? 'official' : official === 0 ? 'computed' : 'mixed',
      relationIds: members.map(r => r.id), tags: mainTags, diagnostics, quality: { ...quality },
    }
    return { built, quality }
  })
}

/** Controllo di qualità: solo i cammini "pronti" sono destinati agli utenti, gli altri a revisione. */
export function assessQuality(tappe: TappaDraft[], connected: boolean, jumps: number): QualityReport {
  const km = tappe.map(t => t.lengthM / 1000)
  const longTappe = km.filter(k => k > LONG_KM).length
  const shortTappe = km.filter(k => k < SHORT_KM).length
  const named = tappe.filter(t => t.fromName && t.toName).length
  const reasons: string[] = []
  if (!connected) reasons.push('tappe non collegate: interruzioni nei dati')
  if (jumps > Math.max(1, tappe.length * 0.1)) reasons.push(`${jumps} salti > 500 m fra tappe`)
  if (tappe.length < 3) reasons.push(`solo ${tappe.length} tappe`)
  if (longTappe > Math.max(1, tappe.length * 0.1)) reasons.push(`${longTappe} tappe oltre ${LONG_KM} km`)
  if (shortTappe > Math.max(1, tappe.length * 0.1)) reasons.push(`${shortTappe} tappe sotto ${SHORT_KM} km`)
  const total = km.reduce((a, b) => a + b, 0)
  return {
    status: reasons.length === 0 ? 'pronto' : 'da_rivedere', reasons, tappe: tappe.length,
    totalKm: Math.round(total * 10) / 10, connected, maxTappaKm: Math.round(Math.max(0, ...km) * 10) / 10,
    longTappe, shortTappe, namedShare: tappe.length ? Math.round((named / tappe.length) * 100) / 100 : 0,
    officialTappe: tappe.filter(t => t.source === 'official').length,
    computedTappe: tappe.filter(t => t.source === 'computed').length,
  }
}

