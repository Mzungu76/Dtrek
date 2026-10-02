import type { PoiItem } from '@/lib/overpass'
import { haversineM } from '@/lib/geoUtils'

// "Davanti a te" (docs/piano-cammini.md, Fase D): i luoghi della tappa ancora da raggiungere, a distanza lungo il
// percorso dalla posizione attuale (non in linea d'aria), con l'ora di arrivo stimata e lo scarto dal piano. Logica pura.

export interface AheadItem {
  poi: PoiItem
  /** Metri da percorrere lungo la traccia da qui al luogo. */
  distanceM: number
  /** Distanza del luogo dalla traccia (deviazione da fare), in metri. */
  offRouteM: number
}

export interface AheadOptions {
  /** Oltre questa distanza dalla traccia un luogo non è "sulla strada". */
  maxOffRouteM?: number
  /** Tolleranza per un luogo appena superato (rumore del GPS), in metri. */
  behindToleranceM?: number
  limit?: number
}

const M_PER_DEG = 111_320

/** Proiezione di un punto sulla traccia: distanza lungo la traccia e distanza dalla traccia (metri). */
export function project(line: [number, number][], cum: number[], lat: number, lon: number): { alongM: number; offM: number } {
  const kx = Math.cos((lat * Math.PI) / 180)
  let best = { alongM: 0, offM: Infinity }
  for (let i = 0; i < line.length - 1; i++) {
    const [aLat, aLon] = line[i], [bLat, bLon] = line[i + 1]
    const ax = (aLon - lon) * kx, ay = aLat - lat
    const bx = (bLon - lon) * kx, by = bLat - lat
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    const px = ax + t * dx, py = ay + t * dy
    const offM = Math.sqrt(px * px + py * py) * M_PER_DEG
    if (offM < best.offM) best = { offM, alongM: cum[i] + t * (cum[i + 1] - cum[i]) }
  }
  return best
}

export function cumulativeM(line: [number, number][]): number[] {
  const cum = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversineM(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]))
  return cum
}

/**
 * Luoghi davanti a chi cammina, in ordine di percorrenza. `alongM` e `totalM` sono la posizione e la lunghezza
 * secondo il motore di navigazione: se la lunghezza calcolata qui differisce, le distanze si riportano a quella scala.
 */
export function poisAhead(pois: PoiItem[], line: [number, number][], alongM: number, totalM: number | null, opts: AheadOptions = {}): AheadItem[] {
  if (line.length < 2) return []
  const { maxOffRouteM = 400, behindToleranceM = 30, limit = 8 } = opts
  const cum = cumulativeM(line)
  const mine = cum[cum.length - 1]
  const scale = totalM && mine > 0 ? totalM / mine : 1
  const out: AheadItem[] = []
  for (const poi of pois) {
    if (poi.lat == null || poi.lon == null) continue
    const { alongM: a, offM } = project(line, cum, poi.lat, poi.lon)
    if (offM > maxOffRouteM) continue
    const distanceM = a * scale - alongM
    if (distanceM < -behindToleranceM) continue
    out.push({ poi, distanceM: Math.max(0, distanceM), offRouteM: offM })
  }
  return out.sort((x, y) => x.distanceM - y.distanceM).slice(0, limit)
}

/** Ora di arrivo a un punto a `distanceM` di strada, in proporzione al tempo che resta all'arrivo della tappa. */
export function etaAtDistance(distanceM: number, remainingM: number, remainingTimeSec: number | null, now: Date): Date | null {
  if (remainingTimeSec == null || remainingM <= 0) return null
  return new Date(now.getTime() + (Math.min(distanceM, remainingM) / remainingM) * remainingTimeSec * 1000)
}

/**
 * Scarto dal piano in minuti (positivo = in ritardo): tempo in cammino finora più quello che resta, contro il tempo
 * previsto per l'intera tappa al passo di piano. Null finché non ci sono i dati.
 */
export function delayVsPlanMin(movingTimeSec: number, remainingTimeSec: number | null, totalRouteM: number, plannedPaceMs: number | null): number | null {
  if (remainingTimeSec == null || !plannedPaceMs || plannedPaceMs <= 0 || totalRouteM <= 0) return null
  return Math.round((movingTimeSec + remainingTimeSec - totalRouteM / plannedPaceMs) / 60)
}
