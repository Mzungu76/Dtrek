import { haversineM } from '../geoUtils'

// Geometria pura dei Cammini (docs/piano-cammini.md, Fase 2): nessuna rete, nessun Supabase —
// stesso principio di lib/metaSearch/borgoItinerary.ts, così l'ETL è testabile su fixture senza
// scaricare nulla (Overpass è irraggiungibile da alcuni ambienti di sviluppo).

export type LatLon = [number, number]

/** [sud, ovest, nord, est] — stesso ordine della clausola bbox di Overpass. */
export type Bbox = [number, number, number, number]

export function polylineLengthM(line: LatLon[]): number {
  let total = 0
  for (let i = 1; i < line.length; i++) total += haversineM(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1])
  return total
}

/** Distanza cumulata in metri a ogni vertice (il primo vale 0). */
export function cumulativeDistances(line: LatLon[]): number[] {
  const out = [0]
  for (let i = 1; i < line.length; i++) {
    out.push(out[i - 1] + haversineM(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]))
  }
  return out
}

function dist(a: LatLon, b: LatLon): number {
  return haversineM(a[0], a[1], b[0], b[1])
}

/**
 * Ricompone in catene continue le way di una relazione OSM, in qualsiasi ordine e verso (i membri di
 * una relazione `route` non sono garantiti ordinati né orientati). Una way si aggancia all'estremo
 * più vicino della catena corrente entro `toleranceM`, invertendola se serve. Più di una catena in
 * uscita significa che nei dati ci sono interruzioni: restano separate, mai unite con un salto
 * fabbricato.
 */
export function stitchWays(ways: LatLon[][], toleranceM = 50): LatLon[][] {
  const remaining = ways.filter(w => w.length >= 2).map(w => [...w])
  const chains: LatLon[][] = []

  while (remaining.length > 0) {
    let chain = remaining.shift()!
    let progress = true
    while (progress && remaining.length > 0) {
      progress = false
      const head = chain[0]
      const tail = chain[chain.length - 1]
      let best: { index: number; d: number; mode: 'tail-start' | 'tail-end' | 'head-end' | 'head-start' } | null = null
      remaining.forEach((w, index) => {
        const ws = w[0], we = w[w.length - 1]
        const candidates = [
          { d: dist(tail, ws), mode: 'tail-start' as const },
          { d: dist(tail, we), mode: 'tail-end' as const },
          { d: dist(head, we), mode: 'head-end' as const },
          { d: dist(head, ws), mode: 'head-start' as const },
        ]
        for (const c of candidates) {
          if (c.d <= toleranceM && (!best || c.d < best.d)) best = { index, ...c }
        }
      })
      if (best) {
        const { index, mode } = best as { index: number; mode: 'tail-start' | 'tail-end' | 'head-end' | 'head-start' }
        const w = remaining.splice(index, 1)[0]
        if (mode === 'tail-start') chain = [...chain, ...w.slice(1)]
        else if (mode === 'tail-end') chain = [...chain, ...[...w].reverse().slice(1)]
        else if (mode === 'head-end') chain = [...w.slice(0, -1), ...chain]
        else chain = [...[...w].reverse().slice(0, -1), ...chain]
        progress = true
      }
    }
    chains.push(chain)
  }
  return chains
}

export function pointInBbox(p: LatLon, bbox: Bbox): boolean {
  return p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3]
}

/** Tratti consecutivi di punti interni al bbox (un percorso che esce e rientra produce più tratti). */
export function clipToBbox(line: LatLon[], bbox: Bbox): LatLon[][] {
  const runs: LatLon[][] = []
  let current: LatLon[] = []
  for (const p of line) {
    if (pointInBbox(p, bbox)) current.push(p)
    else if (current.length > 0) { runs.push(current); current = [] }
  }
  if (current.length > 0) runs.push(current)
  return runs.filter(r => r.length >= 2)
}

/** Inverte la linea se il suo capo finale è più vicino a `hint` di quello iniziale. */
export function orientLine(line: LatLon[], hint: { lat: number; lon: number }): LatLon[] {
  if (line.length < 2) return line
  const dStart = haversineM(hint.lat, hint.lon, line[0][0], line[0][1])
  const dEnd = haversineM(hint.lat, hint.lon, line[line.length - 1][0], line[line.length - 1][1])
  return dEnd < dStart ? [...line].reverse() : line
}

// Proiezione equirettangolare locale — sufficiente per tolleranze di decine di metri.
function toXY(p: LatLon, lat0: number): [number, number] {
  const k = Math.PI / 180
  return [p[1] * k * 6371000 * Math.cos(lat0 * k), p[0] * k * 6371000]
}

function perpendicularDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Douglas-Peucker iterativo (nessuna ricorsione: un cammino può avere decine di migliaia di vertici). */
export function simplifyPolyline(line: LatLon[], toleranceM: number): LatLon[] {
  if (line.length <= 2) return line
  const lat0 = line[0][0]
  const xy = line.map(p => toXY(p, lat0))
  const keep = new Array<boolean>(line.length).fill(false)
  keep[0] = keep[line.length - 1] = true
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length > 0) {
    const [s, e] = stack.pop()!
    let maxD = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = perpendicularDistance(xy[i], xy[s], xy[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return line.filter((_, i) => keep[i])
}

/** Indice del vertice più vicino a `p` e la sua distanza in metri. */
export function nearestVertex(line: LatLon[], p: { lat: number; lon: number }): { index: number; distanceM: number } {
  let index = 0, best = Infinity
  for (let i = 0; i < line.length; i++) {
    const d = haversineM(p.lat, p.lon, line[i][0], line[i][1])
    if (d < best) { best = d; index = i }
  }
  return { index, distanceM: best }
}

export interface TrimResult {
  line: LatLon[]
  trimmedStartM: number
  trimmedEndM: number
}

/**
 * Taglia la linea tra due estremi dichiarati (partenza/arrivo del tratto) invece di fidarsi del solo
 * ritaglio per bbox, che include ciò che sta oltre il confine (nel pilota: il tratto a nord di
 * Acquapendente). Ogni estremo si applica solo se esiste un vertice entro `maxSnapM`; altrimenti
 * quel capo resta com'è (mai un taglio a caso). Se i due estremi risultassero invertiti non taglia.
 */
export function trimToEndpoints(
  line: LatLon[],
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  maxSnapM = 3000,
): TrimResult {
  if (line.length < 2) return { line, trimmedStartM: 0, trimmedEndM: 0 }
  const s = nearestVertex(line, start)
  const e = nearestVertex(line, end)
  const from = s.distanceM <= maxSnapM ? s.index : 0
  const to = e.distanceM <= maxSnapM ? e.index : line.length - 1
  if (from >= to) return { line, trimmedStartM: 0, trimmedEndM: 0 }
  const cum = cumulativeDistances(line)
  return { line: line.slice(from, to + 1), trimmedStartM: cum[from], trimmedEndM: cum[cum.length - 1] - cum[to] }
}
