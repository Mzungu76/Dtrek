import type { CamminoDetail, CamminoTappaDetail } from '@/app/api/cammini/[id]/route'
import type { PlannedHike } from '../plannedStore'

// Piano di un Cammino scelto dall'utente (docs/piano-cammini.md, Fase 4): quali tappe, in che verso,
// raggruppate in quali giornate, da quando. Vive in planned_hikes.cammino_plan (JSONB) ed è l'unica
// fonte delle scelte: la Guida (Fase 5) e il Navigator leggono da qui, mai ricalcolano le giornate.
// Logica pura — nessuna rete, nessun React.

export interface CamminoPlanTappa {
  /** Numero della tappa nel catalogo (dtrek_cammino_tappe.ordinal) — non cambia se si inverte il verso. */
  ordinal: number
  name: string
  fromName: string | null
  toName: string | null
  lengthM: number
  source: 'official' | 'computed'
  endsAtAnchor: boolean | null
  elevationGainM: number | null
  elevationLossM: number | null
  /** Racconto di Giulia per questa tappa, generato su richiesta dell'utente (Fase 5). */
  text?: string
  /** Natura e sapori della tappa, generati su richiesta come il racconto. */
  natura?: string
  sapori?: string
}

export interface CamminoPlanDay {
  /** Ordinali delle tappe percorse in questa giornata, nell'ordine di marcia. */
  tappe: number[]
  lengthM: number
  /** yyyy-mm-dd, solo se l'utente ha scelto una data di partenza. */
  date?: string
}

export type DayGrouping =
  | { mode: 'one_per_day' }
  | { mode: 'max_km'; maxKm: number }

export interface CamminoPlan {
  version: 1
  camminoId: string
  camminoName: string
  structure: 'cammino' | 'rete'
  direction: 'forward' | 'reverse'
  fromOrdinal: number
  toOrdinal: number
  startDate?: string
  grouping: DayGrouping
  days: CamminoPlanDay[]
  /** Copia delle tappe incluse, già nell'ordine di marcia: la guida resta leggibile offline e non
   *  cambia se il catalogo viene reimportato. Senza le polilinee (stanno in routePolyline). */
  tappe: CamminoPlanTappa[]
}

export const MIN_DAY_KM = 10
export const MAX_DAY_KM = 45
export const DEFAULT_DAY_KM = 25

/** Tappe fra due ordinali inclusi (qualunque ordine degli estremi), nell'ordine del catalogo. */
export function selectTappe(all: CamminoTappaDetail[], fromOrdinal: number, toOrdinal: number): CamminoTappaDetail[] {
  const lo = Math.min(fromOrdinal, toOrdinal), hi = Math.max(fromOrdinal, toOrdinal)
  return all.filter(t => t.ordinal >= lo && t.ordinal <= hi).sort((a, b) => a.ordinal - b.ordinal)
}

/** Nell'ordine di marcia: se il verso è inverso, le tappe si invertono, ognuna con la linea girata e i capi scambiati. */
export function orderForDirection(tappe: CamminoTappaDetail[], direction: 'forward' | 'reverse'): CamminoTappaDetail[] {
  if (direction === 'forward') return tappe
  return [...tappe].reverse().map(t => ({
    ...t,
    fromName: t.toName, toName: t.fromName,
    polyline: [...t.polyline].reverse(),
  }))
}

/**
 * Raggruppa tappe consecutive in giornate. `one_per_day`: una tappa al giorno. `max_km`: si
 * accorpano le tappe vicine finché la giornata resta entro il tetto; una tappa già più lunga del
 * tetto resta da sola (mai spezzata: le tappe sono i tratti reali del cammino, non si inventano
 * punti di sosta in mezzo).
 */
export function groupIntoDays(tappe: { ordinal: number; lengthM: number }[], grouping: DayGrouping): CamminoPlanDay[] {
  const days: CamminoPlanDay[] = []
  const limitM = grouping.mode === 'max_km' ? grouping.maxKm * 1000 : 0
  for (const t of tappe) {
    const last = days[days.length - 1]
    if (grouping.mode === 'max_km' && last && last.lengthM + t.lengthM <= limitM) {
      last.tappe.push(t.ordinal)
      last.lengthM += t.lengthM
    } else {
      days.push({ tappe: [t.ordinal], lengthM: t.lengthM })
    }
  }
  return days
}

/** Una data per giornata, consecutive dalla data di partenza (yyyy-mm-dd). Senza data: nessuna. */
export function assignDates(days: CamminoPlanDay[], startDate?: string): CamminoPlanDay[] {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return days.map(({ date: _d, ...d }) => d)
  const [y, m, d] = startDate.split('-').map(Number)
  return days.map((day, i) => {
    // UTC: nessuno scarto di un giorno per ora legale/fuso.
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10)
    return { ...day, date }
  })
}

export interface BuildPlanInput {
  fromOrdinal: number
  toOrdinal: number
  direction: 'forward' | 'reverse'
  grouping: DayGrouping
  startDate?: string
}

export function buildCamminoPlan(detail: CamminoDetail, input: BuildPlanInput): CamminoPlan {
  const selected = orderForDirection(selectTappe(detail.tappe, input.fromOrdinal, input.toOrdinal), input.direction)
  if (selected.length === 0) throw new Error('Nessuna tappa selezionata.')
  const days = assignDates(groupIntoDays(selected, input.grouping), input.startDate)
  return {
    version: 1,
    camminoId: detail.id,
    camminoName: detail.name,
    structure: detail.stats.structure,
    direction: input.direction,
    fromOrdinal: Math.min(input.fromOrdinal, input.toOrdinal),
    toOrdinal: Math.max(input.fromOrdinal, input.toOrdinal),
    ...(input.startDate ? { startDate: input.startDate } : {}),
    grouping: input.grouping,
    days,
    tappe: selected.map(t => ({
      ordinal: t.ordinal, name: t.name, fromName: t.fromName, toName: t.toName, lengthM: t.lengthM,
      source: t.source, endsAtAnchor: t.endsAtAnchor, elevationGainM: t.elevationGainM, elevationLossM: t.elevationLossM,
    })),
  }
}

/** Polilinea dell'intera selezione, nell'ordine di marcia, senza punti doppi alle giunzioni. */
export function selectionPolyline(detail: CamminoDetail, input: Pick<BuildPlanInput, 'fromOrdinal' | 'toOrdinal' | 'direction'>): [number, number][] {
  const ordered = orderForDirection(selectTappe(detail.tappe, input.fromOrdinal, input.toOrdinal), input.direction)
  return ordered.flatMap((t, i) => (i === 0 ? t.polyline : t.polyline.slice(1)))
}

/** Passo medio di un cammino a piedi con zaino, in km/h — stima di partenza finché il dislivello non c'è. */
const WALKING_KMH = 4

export function planTitle(plan: CamminoPlan): string {
  const first = plan.tappe[0], last = plan.tappe[plan.tappe.length - 1]
  const whole = plan.fromOrdinal === 1 && plan.tappe.length === plan.toOrdinal - plan.fromOrdinal + 1 && plan.structure === 'cammino'
  if (whole && plan.tappe.length > 1) return plan.camminoName
  if (plan.tappe.length === 1) return `${plan.camminoName} — tappa ${first.ordinal}`
  return `${plan.camminoName} — ${first.fromName ?? `tappa ${first.ordinal}`} → ${last.toName ?? `tappa ${last.ordinal}`}`
}

/**
 * La Meta salvabile (planned_hikes, meta_type='cammino') per un piano. Le quote restano a 0:
 * OpenStreetMap non le porta e il dislivello per tappa si calcola dal DTM (Fase 5) — nessun valore
 * inventato qui, la guida non deve mostrare un D+ che non c'è.
 */
export function camminoPlanToPlannedHike(detail: CamminoDetail, plan: CamminoPlan, now: string = new Date().toISOString()): PlannedHike {
  const polyline = selectionPolyline(detail, plan)
  const lengthM = plan.tappe.reduce((s, t) => s + t.lengthM, 0)
  const mid = polyline[Math.floor(polyline.length / 2)] ?? polyline[0]
  return {
    id: crypto.randomUUID(),
    title: planTitle(plan),
    createdAt: now,
    plannedDate: plan.startDate,
    userNotes: detail.description ?? undefined,
    distanceMeters: Math.round(lengthM),
    elevationGain: 0,
    elevationLoss: 0,
    altitudeMax: 0,
    altitudeMin: 0,
    estimatedTimeSeconds: Math.round((lengthM / 1000 / WALKING_KMH) * 3600),
    routePolyline: polyline,
    metaType: 'cammino',
    placeId: plan.camminoId,
    latitude: mid?.[0],
    longitude: mid?.[1],
    zone: detail.region ?? undefined,
    camminoPlan: plan,
  }
}
