import type { ServiceCategory, ServiceItem } from './services'
import { cumulativeM, project } from './ahead'

// Servizi disposti lungo la tappa e i tratti senza servizi (docs/piano-cammini.md, Fase E). Logica pura.

export interface PlacedService {
  service: ServiceItem
  /** Metri dalla partenza della tappa, lungo la traccia. */
  alongM: number
  /** Deviazione dalla traccia, metri. */
  offRouteM: number
}

/** Proietta i servizi sulla traccia, in ordine di percorrenza; scarta quelli oltre `maxOffRouteM` dal sentiero. */
export function placeServices(services: ServiceItem[], line: [number, number][], totalM: number | null, maxOffRouteM = 600): PlacedService[] {
  if (line.length < 2) return []
  const cum = cumulativeM(line)
  const mine = cum[cum.length - 1]
  const scale = totalM && mine > 0 ? totalM / mine : 1
  const out: PlacedService[] = []
  for (const service of services) {
    const { alongM, offM } = project(line, cum, service.lat, service.lon)
    if (offM <= maxOffRouteM) out.push({ service, alongM: alongM * scale, offRouteM: offM })
  }
  return out.sort((a, b) => a.alongM - b.alongM)
}

export interface NextService extends PlacedService {
  /** Metri da percorrere da qui al servizio. */
  distanceM: number
}

/** Il primo servizio della categoria davanti a `alongM` (con una piccola tolleranza per uno appena superato), o null. */
export function nextOfCategory(placed: PlacedService[], category: ServiceCategory, alongM: number, behindToleranceM = 30): NextService | null {
  for (const p of placed) {
    if (p.service.category !== category) continue
    const distanceM = p.alongM - alongM
    if (distanceM >= -behindToleranceM) return { ...p, distanceM: Math.max(0, distanceM) }
  }
  return null
}

export interface ServiceGap { fromM: number; toM: number; lengthM: number }

/** Tratti lunghi almeno `minGapM` senza alcun servizio delle categorie date, partenza e arrivo compresi. */
export function serviceGaps(placed: PlacedService[], categories: ServiceCategory[], totalM: number, minGapM: number): ServiceGap[] {
  const marks = placed.filter(p => categories.includes(p.service.category)).map(p => p.alongM)
  const points = [0, ...marks, totalM].sort((a, b) => a - b)
  const out: ServiceGap[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const lengthM = points[i + 1] - points[i]
    if (lengthM >= minGapM) out.push({ fromM: points[i], toM: points[i + 1], lengthM })
  }
  return out
}

export interface WaterAdvice {
  /** Metri alla prossima acqua davanti a te; null se non ce n'è fino all'arrivo. */
  nextM: number | null
  /** Dopo quel punto, metri fino alla successiva acqua (o all'arrivo): quanta ne devi portare. Null se non c'è una prossima. */
  gapAfterM: number | null
}

export function waterAdvice(placed: PlacedService[], alongM: number, totalM: number): WaterAdvice {
  const water = placed.filter(p => p.service.category === 'water')
  const idx = water.findIndex(p => p.alongM - alongM >= -30)
  if (idx < 0) return { nextM: null, gapAfterM: null }
  const next = water[idx], after = water[idx + 1]
  return { nextM: Math.max(0, next.alongM - alongM), gapAfterM: (after ? after.alongM : totalM) - next.alongM }
}

export interface ServiceCounts { category: ServiceCategory; count: number }

export function countByCategory(placed: PlacedService[]): ServiceCounts[] {
  const m = new Map<ServiceCategory, number>()
  for (const p of placed) m.set(p.service.category, (m.get(p.service.category) ?? 0) + 1)
  return Array.from(m, ([category, count]) => ({ category, count }))
}
