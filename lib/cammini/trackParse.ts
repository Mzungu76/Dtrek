import { polylineLengthM, type LatLon } from './geometry'

// Lettura di tracce GPX/KML fornite da enti e associazioni (import dei cammini da file, non da OSM).
// Logica pura, senza dipendenze XML: i file sono regolari (trk/trkseg/trkpt, rte/rtept, LineString).

export interface ParsedTrack {
  name?: string
  /** Un segmento per <trkseg> (GPX) o per <LineString> (KML). */
  segments: LatLon[][]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXmlText(s: string): string {
  return s
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, n: string) => ENTITIES[n])
    .replace(/&amp;/g, '&')
    .trim()
}

function firstName(block: string): string | undefined {
  // Prima <name> del blocco, ignorando quelle dei sotto-elementi (wpt dentro trk non esistono in GPX).
  const m = /<name>([\s\S]*?)<\/name>/.exec(block)
  const t = m ? decodeXmlText(m[1]) : ''
  return t || undefined
}

function pointsOf(block: string, tag: string): LatLon[] {
  const out: LatLon[] = []
  const re = new RegExp(`<${tag}\\b([^>]*)>`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) {
    const lat = /\blat="([^"]+)"/.exec(m[1]), lon = /\blon="([^"]+)"/.exec(m[1])
    if (lat && lon && Number.isFinite(+lat[1]) && Number.isFinite(+lon[1])) out.push([+lat[1], +lon[1]])
  }
  return out
}

export function parseGpx(xml: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = []
  for (const m of Array.from(xml.matchAll(/<trk>([\s\S]*?)<\/trk>/g))) {
    const segments = Array.from(m[1].matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)).map(s => pointsOf(s[1], 'trkpt')).filter(s => s.length >= 2)
    if (segments.length > 0) tracks.push({ name: firstName(m[1]), segments })
  }
  // Alcuni export (ViewRanger) scrivono la traccia come rotta <rte>.
  for (const m of Array.from(xml.matchAll(/<rte>([\s\S]*?)<\/rte>/g))) {
    const seg = pointsOf(m[1], 'rtept')
    if (seg.length >= 2) tracks.push({ name: firstName(m[1]), segments: [seg] })
  }
  return tracks
}

export function parseKml(xml: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = []
  for (const m of Array.from(xml.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g))) {
    const segments: LatLon[][] = []
    for (const c of Array.from(m[1].matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g))) {
      const seg: LatLon[] = []
      for (const tok of c[1].trim().split(/\s+/)) {
        const [lon, lat] = tok.split(',').map(Number)
        if (Number.isFinite(lat) && Number.isFinite(lon)) seg.push([lat, lon])
      }
      if (seg.length >= 2) segments.push(seg)
    }
    if (segments.length > 0) tracks.push({ name: firstName(m[1]), segments })
  }
  return tracks
}

export function parseTrackFile(fileName: string, xml: string): ParsedTrack[] {
  return /\.kml$/i.test(fileName) ? parseKml(xml) : parseGpx(xml)
}

/**
 * Unisce i segmenti di una tappa in un'unica linea: parte dal primo e, a ogni passo, accoda il
 * segmento il cui capo (nell'uno o nell'altro verso) è più vicino alla fine corrente.
 */
export function chainSegments(segments: LatLon[][]): LatLon[] {
  if (segments.length === 0) return []
  const rest = segments.slice(1)
  let line = segments[0].slice()
  while (rest.length > 0) {
    const end = line[line.length - 1]
    let best = 0, bestRev = false, bestD = Infinity
    rest.forEach((s, i) => {
      const dF = polylineLengthM([end, s[0]]), dR = polylineLengthM([end, s[s.length - 1]])
      if (dF < bestD) { bestD = dF; best = i; bestRev = false }
      if (dR < bestD) { bestD = dR; best = i; bestRev = true }
    })
    const next = rest.splice(best, 1)[0]
    line = line.concat(bestRev ? next.slice().reverse() : next)
  }
  return line
}
