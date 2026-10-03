import type { OverpassMember, OverpassRelation } from '../../scripts/places/cammini/build'
import type { WayGeometry } from '../../scripts/places/cammini/buildRegistry'

// Legge l'XML OSM che produce `osmium tags-filter … -f osm` (estratto offline, senza Overpass) e lo
// porta alla stessa forma che usa il resto della pipeline (OverpassRelation[] + Map<wayId, WayGeometry>),
// così `buildFromRegistry` non deve sapere da dove sono arrivati relazioni e way.
//
// Non è un parser XML generico: si appoggia alla forma regolare con cui osmium scrive i file
// (un elemento per riga, attributi fra virgolette doppie, nessun namespace) — scritta e verificata
// con `osmium cat`/`osmium tags-filter` 1.16, non con un parser DOM.

const unescapeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const attr = (block: string, name: string): string | undefined => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(block)
  return m ? unescapeXml(m[1]) : undefined
}

function parseTags(block: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const m of Array.from(block.matchAll(/<tag\s+([^>]*?)\/>/g))) {
    const k = attr(m[1], 'k')
    const v = attr(m[1], 'v')
    if (k !== undefined && v !== undefined) tags[k] = v
  }
  return tags
}

export interface ParsedOsm {
  relations: OverpassRelation[]
  ways: Map<number, WayGeometry>
}

export function parseOsmXml(xml: string): ParsedOsm {
  const nodeCoord = new Map<number, { lat: number; lon: number }>()
  for (const m of Array.from(xml.matchAll(/<node\s+([^>]*?)\/?>/g))) {
    const id = attr(m[1], 'id')
    const lat = attr(m[1], 'lat')
    const lon = attr(m[1], 'lon')
    if (id && lat && lon) nodeCoord.set(Number(id), { lat: Number(lat), lon: Number(lon) })
  }

  const ways = new Map<number, WayGeometry>()
  for (const m of Array.from(xml.matchAll(/<way\s+([^>]*?)>([\s\S]*?)<\/way>/g))) {
    const id = attr(m[1], 'id')
    if (!id) continue
    const refs: number[] = []
    for (const nd of Array.from(m[2].matchAll(/<nd\s+([^>]*?)\/>/g))) {
      const ref = attr(nd[1], 'ref')
      if (ref) refs.push(Number(ref))
    }
    ways.set(Number(id), refs.map(r => nodeCoord.get(r) ?? null))
  }

  const relations: OverpassRelation[] = []
  for (const m of Array.from(xml.matchAll(/<relation\s+([^>]*?)>([\s\S]*?)<\/relation>/g))) {
    const id = attr(m[1], 'id')
    if (!id) continue
    const members: OverpassMember[] = []
    for (const mem of Array.from(m[2].matchAll(/<member\s+([^>]*?)\/>/g))) {
      const type = attr(mem[1], 'type')
      const ref = attr(mem[1], 'ref')
      const role = attr(mem[1], 'role')
      if (type === 'way' || type === 'node' || type === 'relation') {
        members.push({ type, ref: Number(ref), ...(role ? { role } : {}) })
      }
    }
    relations.push({ type: 'relation', id: Number(id), tags: parseTags(m[2]), members })
  }

  return { relations, ways }
}
