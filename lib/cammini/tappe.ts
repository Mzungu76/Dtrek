import { cumulativeDistances, nearestVertex, polylineLengthM, simplifyPolyline, type LatLon } from './geometry'

// Suddivisione in tappe di un Cammino (docs/piano-cammini.md, Fase 2). Due strade:
//  - tappe UFFICIALI: già sotto-relazioni della fonte (OSM "Tappa 3: A - B"), usate così come sono;
//  - tappe CALCOLATE: quando la fonte non le dà, si taglia la linea a budget di giornata, preferendo
//    chiudere la tappa in un borgo noto del catalogo (dove si dorme) invece di un punto qualunque.
// Le tappe qui sono "bozze" senza dislivello: OSM non porta quote, il D+ si calcola dopo dal DTM.

export interface TappaAnchor {
  id: string
  name: string
  lat: number
  lon: number
  population?: number | null
}

export interface TappaDraft {
  ordinal: number
  name: string
  fromName?: string
  toName?: string
  fromAnchorId?: string
  toAnchorId?: string
  lengthM: number
  polyline: LatLon[]
  source: 'official' | 'computed'
  officialRelationId?: number
  /** Solo per le calcolate: true se la fine tappa coincide con un borgo del catalogo. */
  endsAtAnchor?: boolean
}

export interface SplitOptions {
  targetM: number
  minM: number
  maxM: number
  /** Distanza massima fra un borgo e la linea perché possa chiudere una tappa. */
  snapM: number
  /** Soglia di popolazione sotto cui un borgo non è considerato punto di sosta (se nota). */
  minPopulation: number
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  targetM: 20_000, minM: 12_000, maxM: 28_000, snapM: 1_500, minPopulation: 300,
}

const TAPPA_NUMBER_RE = /tappa\s*(?:n\.?\s*)?(\d+)/i

/** Numero di tappa dal nome della relazione ("Via Francigena – Tappa 12: A - B") o da `ref`. */
export function parseTappaNumber(name: string | undefined, ref?: string): number | null {
  const m = name ? TAPPA_NUMBER_RE.exec(name) : null
  if (m) return Number(m[1])
  if (ref && /^\d+$/.test(ref.trim())) return Number(ref.trim())
  return null
}

/** "Tappa 3: Acquapendente - Bolsena" → { from, to }; null se il nome non ha la forma "A - B". */
export function parseTappaEndpoints(name: string | undefined): { from: string; to: string } | null {
  if (!name) return null
  const afterColon = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name.replace(TAPPA_NUMBER_RE, '')
  const parts = afterColon.split(/\s[-–—→]\s/).map(s => s.replace(/^[\s\-–—]+|[\s\-–—]+$/g, ''))
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { from: parts[0], to: parts[1] }
}

interface AnchorOnLine { anchor: TappaAnchor; vertex: number; cum: number }

function anchorsOnLine(line: LatLon[], cum: number[], anchors: TappaAnchor[], opts: SplitOptions): AnchorOnLine[] {
  const out: AnchorOnLine[] = []
  for (const anchor of anchors) {
    if (anchor.population != null && anchor.population < opts.minPopulation) continue
    const { index, distanceM } = nearestVertex(line, anchor)
    if (distanceM <= opts.snapM) out.push({ anchor, vertex: index, cum: cum[index] })
  }
  return out.sort((a, b) => a.cum - b.cum)
}

/**
 * Taglia una linea ordinata in tappe di circa `targetM`. Ogni taglio cade, se possibile, su un
 * borgo del catalogo nella finestra [minM, maxM] dalla fine della tappa precedente — il più vicino
 * al target (a parità, il più popoloso); se nessun borgo ci sta, taglia a `targetM` esatti
 * (endsAtAnchor=false: la UI deve dirlo, mai spacciare per un paese un punto in mezzo ai campi).
 * Un resto finale troppo corto viene fuso nell'ultima tappa invece di diventare una tappa-briciola.
 */
export function splitIntoTappe(line: LatLon[], anchors: TappaAnchor[], options: Partial<SplitOptions> = {}): TappaDraft[] {
  const opts = { ...DEFAULT_SPLIT_OPTIONS, ...options }
  if (line.length < 2) return []
  const cum = cumulativeDistances(line)
  const total = cum[cum.length - 1]
  const onLine = anchorsOnLine(line, cum, anchors, opts)

  const cuts: { vertex: number; anchor?: TappaAnchor }[] = []
  let startVertex = 0
  while (total - cum[startVertex] > opts.maxM) {
    const base = cum[startVertex]
    const inWindow = onLine.filter(a => a.vertex > startVertex && a.cum - base >= opts.minM && a.cum - base <= opts.maxM)
    let cut: { vertex: number; anchor?: TappaAnchor }
    if (inWindow.length > 0) {
      const best = inWindow.reduce((p, c) => {
        const dp = Math.abs(p.cum - base - opts.targetM), dc = Math.abs(c.cum - base - opts.targetM)
        if (dc < dp) return c
        if (dc === dp && (c.anchor.population ?? 0) > (p.anchor.population ?? 0)) return c
        return p
      })
      cut = { vertex: best.vertex, anchor: best.anchor }
    } else {
      let v = startVertex + 1
      while (v < line.length - 1 && cum[v] - base < opts.targetM) v++
      cut = { vertex: v }
    }
    cuts.push(cut)
    startVertex = cut.vertex
  }

  // Resto finale troppo corto: lo si fonde nella tappa precedente.
  if (cuts.length > 0 && total - cum[cuts[cuts.length - 1].vertex] < opts.minM * 0.5) cuts.pop()

  const boundaries = [{ vertex: 0 } as { vertex: number; anchor?: TappaAnchor }, ...cuts, { vertex: line.length - 1 } as { vertex: number; anchor?: TappaAnchor }]
  const drafts: TappaDraft[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const a = boundaries[i], b = boundaries[i + 1]
    const slice = line.slice(a.vertex, b.vertex + 1)
    // I capi della linea intera possono comunque coincidere con un borgo noto (partenza/arrivo).
    const fromAnchor = a.anchor ?? (i === 0 ? onLine.find(x => x.cum <= opts.snapM)?.anchor : undefined)
    const toAnchor = b.anchor ?? (i === boundaries.length - 2 ? [...onLine].reverse().find(x => total - x.cum <= opts.snapM)?.anchor : undefined)
    drafts.push({
      ordinal: i + 1,
      name: `Tappa ${i + 1}`,
      fromName: fromAnchor?.name,
      toName: toAnchor?.name,
      fromAnchorId: fromAnchor?.id,
      toAnchorId: toAnchor?.id,
      lengthM: polylineLengthM(slice),
      polyline: slice,
      source: 'computed',
      endsAtAnchor: !!toAnchor,
    })
  }
  return drafts
}

/** Polilinea di una tappa ridotta per la persistenza (tolleranza in metri). */
export function simplifyTappa(t: TappaDraft, toleranceM: number): TappaDraft {
  return { ...t, polyline: simplifyPolyline(t.polyline, toleranceM) }
}
