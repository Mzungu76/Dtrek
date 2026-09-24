import { describe, it, expect } from 'vitest'
import {
  mergeStopCandidates, nearestStops, orderStopsNearestNeighbor, groupStopsIntoTappe,
  culturalTappaBudgetMinutes, DAY_BUDGET_MINUTES, HALF_DAY_BUDGET_MINUTES, MULTI_DAY_BUDGET_MINUTES,
  visitMinutesFor, WALK_SPEED_MPS,
  partitionStopsByOverrides, effectiveVisitMinutesFor, bucketStopsByEffectiveTappa,
  spliceLegsForRemovedStops, buildStraightLegs, summarizeTappa,
  type ItineraryStopCandidate, type BorgoItineraryOverrides, type ItineraryTappa,
} from '../borgoItinerary'
import type { ItineraryLeg } from '@/app/api/borgo-itinerary/route'

function stop(id: string, name: string, lat: number, lon: number, extra: Partial<ItineraryStopCandidate> = {}): ItineraryStopCandidate {
  return { id, name, lat, lon, source: 'archivio', ...extra }
}

function leg(distanceM: number): ItineraryLeg {
  return { fromIdx: 0, toIdx: 1, distanceM, polyline: [], real: true }
}

describe('mergeStopCandidates', () => {
  it('non duplica una voce Wikipedia vicina con un nome simile a una tappa già in archivio', () => {
    const archive = [stop('a1', 'Chiesa di San Pietro', 42.0, 12.0)]
    const wiki = [stop('wiki:1', 'Chiesa di San Pietro (Vetralla)', 42.0001, 12.0001, { source: 'wikipedia', description: 'Una chiesa storica.' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('a1')
    // Arricchita con la descrizione mancante presa da Wikipedia.
    expect(merged[0].description).toBe('Una chiesa storica.')
  })

  it('non sovrascrive una descrizione già presente in archivio', () => {
    const archive = [stop('a1', 'Chiesa di San Pietro', 42.0, 12.0, { description: 'Descrizione originale MiC.' })]
    const wiki = [stop('wiki:1', 'Chiesa di San Pietro', 42.0001, 12.0001, { source: 'wikipedia', description: 'Testo Wikipedia.' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged[0].description).toBe('Descrizione originale MiC.')
  })

  it('tiene separate due voci vicine ma con nomi diversi', () => {
    const archive = [stop('a1', 'Museo Civico', 42.0, 12.0)]
    const wiki = [stop('wiki:1', 'Palazzo Comunale', 42.0001, 12.0001, { source: 'wikipedia' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged).toHaveLength(2)
  })

  it('tiene separate due voci con nome simile ma lontane', () => {
    const archive = [stop('a1', 'Chiesa di San Pietro', 42.0, 12.0)]
    const wiki = [stop('wiki:1', 'Chiesa di San Pietro', 43.0, 13.0, { source: 'wikipedia' })]
    const merged = mergeStopCandidates(archive, wiki)
    expect(merged).toHaveLength(2)
  })
})

describe('nearestStops', () => {
  it('tiene solo le N tappe più vicine al centro, in ordine di distanza', () => {
    const center = { lat: 42.0, lon: 12.0 }
    const stops = [
      stop('far', 'Lontana', 42.05, 12.05),
      stop('near', 'Vicina', 42.001, 12.001),
      stop('mid', 'Media', 42.01, 12.01),
    ]
    const result = nearestStops(center, stops, 2)
    expect(result.map(s => s.id)).toEqual(['near', 'mid'])
  })
})

describe('orderStopsNearestNeighbor', () => {
  it('visita sempre la tappa non ancora vista più vicina alla posizione corrente', () => {
    const start = { lat: 0, lon: 0 }
    // B è la più vicina al borgo, ma da B la tappa più vicina è C (non A, che è più lontana da B
    // di quanto lo sia C) — verifica che l'ordine segua la posizione CORRENTE, non solo la
    // distanza dal punto di partenza.
    const a = stop('a', 'A', 0, 0.010)
    const b = stop('b', 'B', 0, 0.001)
    const c = stop('c', 'C', 0, 0.002)
    const ordered = orderStopsNearestNeighbor(start, [a, b, c])
    expect(ordered.map(s => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('un elenco vuoto produce un ordine vuoto', () => {
    expect(orderStopsNearestNeighbor({ lat: 0, lon: 0 }, [])).toEqual([])
  })
})

describe('visitMinutesFor', () => {
  it('siteType noto → il tempo di visita configurato per quel tipo (lib/metaTypes.ts)', () => {
    expect(visitMinutesFor({ siteType: 'museo' })).toBe(90)
    expect(visitMinutesFor({ siteType: 'monumento' })).toBe(15)
  })

  it('nessun siteType (tappa da Wikipedia, o archivio senza subtype) → il default prudente, mai zero', () => {
    expect(visitMinutesFor({})).toBeGreaterThan(0)
  })
})

describe('culturalTappaBudgetMinutes', () => {
  it('nessuna traccia GPS reale collegata (cammino_urbano) → l\'intera giornata libera per la cultura', () => {
    expect(culturalTappaBudgetMinutes(undefined)).toBe(DAY_BUDGET_MINUTES)
  })

  it('una traccia a durata zero è trattata come assente, mai un budget azzerato', () => {
    expect(culturalTappaBudgetMinutes(0)).toBe(DAY_BUDGET_MINUTES)
  })

  it('con una traccia reale (trekking misto) → il residuo della giornata dopo il cammino fisico', () => {
    expect(culturalTappaBudgetMinutes(120)).toBe(DAY_BUDGET_MINUTES - 120)
  })

  it('mai sotto il pavimento, anche quando la traccia da sola esaurirebbe l\'intera giornata', () => {
    expect(culturalTappaBudgetMinutes(DAY_BUDGET_MINUTES + 500)).toBeGreaterThan(0)
    expect(culturalTappaBudgetMinutes(DAY_BUDGET_MINUTES + 500)).toBeLessThan(DAY_BUDGET_MINUTES)
  })

  it('un override esplicito sostituisce il default automatico', () => {
    expect(culturalTappaBudgetMinutes(undefined, HALF_DAY_BUDGET_MINUTES)).toBe(HALF_DAY_BUDGET_MINUTES)
    expect(culturalTappaBudgetMinutes(undefined, MULTI_DAY_BUDGET_MINUTES)).toBe(MULTI_DAY_BUDGET_MINUTES)
  })

  it('la sottrazione del trekking misto si applica comunque sopra un override esplicito', () => {
    expect(culturalTappaBudgetMinutes(60, HALF_DAY_BUDGET_MINUTES)).toBe(HALF_DAY_BUDGET_MINUTES - 60)
  })
})

describe('groupStopsIntoTappe', () => {
  const center = { lat: 0, lon: 0 }

  it('un elenco vuoto produce nessuna tappa', () => {
    expect(groupStopsIntoTappe(center, [], [], 6, 150)).toEqual([])
  })

  it('poche tappe vicine restano tutte in un\'unica tappa quando il budget di tempo è ampio', () => {
    const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 0, 0), stop('c', 'C', 0, 0)]
    const legs = [leg(500), leg(500), leg(500)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 6, 600)
    expect(tappe).toHaveLength(1)
    expect(tappe[0].stops.map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(tappe[0].distanceM).toBe(1500)
    expect(tappe[0].startPoint).toEqual(center)
    // Cammino (3×500m a WALK_SPEED_MPS) + visita (3× il default, nessun siteType impostato).
    const expectedMinutes = Math.round(3 * ((500 / WALK_SPEED_MPS / 60) + visitMinutesFor({})))
    expect(tappe[0].totalMinutes).toBe(expectedMinutes)
  })

  it('si divide per numero massimo di punti anche con un budget di tempo amplissimo', () => {
    const stops = ['a', 'b', 'c', 'd', 'e'].map(id => stop(id, id, 0, 0))
    const legs = stops.map(() => leg(100))
    const tappe = groupStopsIntoTappe(center, stops, legs, 2, 100_000)
    expect(tappe.map(t => t.stops.map(s => s.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  })

  it('si divide per tempo massimo accumulato — cammino PIÙ tempo di visita, non solo distanza', () => {
    // Stesso identico tragitto (1000m ciascuna) ma tappe di tipo diverso (tempi di visita diversi):
    // un museo (90min) esaurisce il budget dopo un solo punto, un monumento (15min) ne fa stare di più.
    const legs = [leg(1000), leg(1000), leg(1000)]
    const budget = (1000 / WALK_SPEED_MPS / 60) + 100 // poco sopra "un museo", sotto "due musei"

    const museumStops = ['a', 'b', 'c'].map(id => stop(id, id, 0, 0, { siteType: 'museo' }))
    expect(groupStopsIntoTappe(center, museumStops, legs, 6, budget).map(t => t.stops.length)).toEqual([1, 1, 1])

    const monumentStops = ['a', 'b', 'c'].map(id => stop(id, id, 0, 0, { siteType: 'monumento' }))
    // Un monumento (15min) pesa molto meno di un museo: più punti stanno nello stesso budget.
    expect(groupStopsIntoTappe(center, monumentStops, legs, 6, budget).length)
      .toBeLessThan(groupStopsIntoTappe(center, museumStops, legs, 6, budget).length)
  })

  it('una tappa non è mai vuota, anche quando il primo punto da solo supera già il budget', () => {
    const stops = [stop('a', 'A', 0, 0, { siteType: 'museo' }), stop('b', 'B', 0, 0, { siteType: 'monumento' })]
    const legs = [leg(5000), leg(100)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 6, 40)
    expect(tappe.map(t => t.stops.map(s => s.id))).toEqual([['a'], ['b']])
  })

  it('la tappa successiva parte dall\'ultimo punto della precedente, non dal centro del borgo', () => {
    const stops = ['a', 'b', 'c'].map(id => stop(id, id, 1, 1))
    const legs = [leg(100), leg(100), leg(100)]
    const tappe = groupStopsIntoTappe(center, stops, legs, 1, 100_000)
    expect(tappe).toHaveLength(3)
    expect(tappe[0].startPoint).toEqual(center)
    expect(tappe[1].startPoint).toEqual({ lat: 1, lon: 1 }) // ultimo punto di tappe[0] ('a')
    expect(tappe[2].startPoint).toEqual({ lat: 1, lon: 1 }) // ultimo punto di tappe[1] ('b')
  })
})

describe('partitionStopsByOverrides', () => {
  const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 0, 0), stop('c', 'C', 0, 0)]

  it('nessun override → tutte attive, nessuna spenta', () => {
    expect(partitionStopsByOverrides(stops, undefined)).toEqual({ activeStops: stops, disabledStops: [] })
  })

  it('separa i punti spenti da quelli attivi, preservando l\'ordine originale', () => {
    const overrides: BorgoItineraryOverrides = { b: { disabled: true } }
    const result = partitionStopsByOverrides(stops, overrides)
    expect(result.activeStops.map(s => s.id)).toEqual(['a', 'c'])
    expect(result.disabledStops.map(s => s.id)).toEqual(['b'])
  })

  it('un override senza disabled non spegne il punto', () => {
    const overrides: BorgoItineraryOverrides = { b: { visitMinutes: 30 } }
    const result = partitionStopsByOverrides(stops, overrides)
    expect(result.activeStops.map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(result.disabledStops).toEqual([])
  })
})

describe('effectiveVisitMinutesFor', () => {
  it('nessun override → il default per tipo', () => {
    const s = stop('a', 'A', 0, 0, { siteType: 'museo' })
    expect(effectiveVisitMinutesFor(s, undefined)).toBe(visitMinutesFor(s))
  })

  it('override presente → sostituisce il default, anche a zero', () => {
    const s = stop('a', 'A', 0, 0, { siteType: 'museo' })
    expect(effectiveVisitMinutesFor(s, { a: { visitMinutes: 200 } })).toBe(200)
  })

  it('override su un altro punto non lo tocca', () => {
    const s = stop('a', 'A', 0, 0, { siteType: 'museo' })
    expect(effectiveVisitMinutesFor(s, { b: { visitMinutes: 200 } })).toBe(visitMinutesFor(s))
  })
})

describe('bucketStopsByEffectiveTappa', () => {
  const center = { lat: 0, lon: 0 }

  function tappa(stops: ItineraryStopCandidate[]): ItineraryTappa {
    return { stops, legs: stops.map(() => leg(100)), distanceM: 0, totalMinutes: 0, startPoint: center }
  }

  it('nessun override → ricalca esattamente il raggruppamento automatico', () => {
    const auto = [tappa([stop('a', 'A', 0, 0)]), tappa([stop('b', 'B', 0, 0), stop('c', 'C', 0, 0)])]
    const buckets = bucketStopsByEffectiveTappa(auto, undefined)
    expect(buckets.map(b => b.map(s => s.id))).toEqual([['a'], ['b', 'c']])
  })

  it('un pin esplicito vince sul raggruppamento automatico', () => {
    const auto = [tappa([stop('a', 'A', 0, 0), stop('b', 'B', 0, 0)]), tappa([stop('c', 'C', 0, 0)])]
    // 'b' era in tappa 0, l'utente lo sposta manualmente in tappa 1.
    const overrides: BorgoItineraryOverrides = { b: { tappaIndex: 1 } }
    const buckets = bucketStopsByEffectiveTappa(auto, overrides)
    expect(buckets.map(b => b.map(s => s.id))).toEqual([['a'], ['b', 'c']])
  })

  it('un pin oltre l\'ultima tappa automatica apre una nuova tappa', () => {
    const auto = [tappa([stop('a', 'A', 0, 0), stop('b', 'B', 0, 0)])]
    const overrides: BorgoItineraryOverrides = { b: { tappaIndex: 2 } }
    const buckets = bucketStopsByEffectiveTappa(auto, overrides)
    expect(buckets.map(b => b.map(s => s.id))).toEqual([['a'], [], ['b']].filter(b => b.length > 0))
  })

  it('un bucket rimasto vuoto (nessun punto assegnato) non compare nel risultato', () => {
    const auto = [tappa([stop('a', 'A', 0, 0)]), tappa([stop('b', 'B', 0, 0)])]
    // Entrambi i punti spostati in tappa 0: la tappa 1 resta vuota e va rimossa.
    const overrides: BorgoItineraryOverrides = { b: { tappaIndex: 0 } }
    const buckets = bucketStopsByEffectiveTappa(auto, overrides)
    expect(buckets.map(b => b.map(s => s.id))).toEqual([['a', 'b']])
  })
})

describe('spliceLegsForRemovedStops', () => {
  const tappaStart = { lat: 0, lon: 0 }
  const stops = [stop('a', 'A', 0, 1), stop('b', 'B', 0, 2), stop('c', 'C', 0, 3)]
  const legs = [leg(100), leg(100), leg(100)]

  it('nessun punto rimosso → stops invariati, legs invariate salvo fromIdx/toIdx correttamente indicizzati', () => {
    const result = spliceLegsForRemovedStops(stops, legs, new Set(), tappaStart)
    expect(result.stops).toEqual(stops)
    expect(result.legs.map(l => ({ distanceM: l.distanceM, polyline: l.polyline, real: l.real }))).toEqual(
      legs.map(l => ({ distanceM: l.distanceM, polyline: l.polyline, real: l.real })),
    )
    expect(result.legs.map(l => [l.fromIdx, l.toIdx])).toEqual([[-1, 0], [0, 1], [1, 2]])
  })

  it('rimuove il punto centrale e sostituisce le due legs circostanti con un unico ponte', () => {
    const result = spliceLegsForRemovedStops(stops, legs, new Set(['b']), tappaStart)
    expect(result.stops.map(s => s.id)).toEqual(['a', 'c'])
    expect(result.legs).toHaveLength(2)
    // La prima leg (verso 'a') resta quella originale, invariata.
    expect(result.legs[0]).toEqual({ ...legs[0], fromIdx: -1, toIdx: 0 })
    // Il ponte 'a' → 'c' è una nuova linea d'aria, mai spacciata per reale.
    expect(result.legs[1].real).toBe(false)
    expect(result.legs[1].fromIdx).toBe(0)
    expect(result.legs[1].toIdx).toBe(1)
  })

  it('rimuove il primo punto → il ponte riparte dal punto di partenza della tappa', () => {
    const result = spliceLegsForRemovedStops(stops, legs, new Set(['a']), tappaStart)
    expect(result.stops.map(s => s.id)).toEqual(['b', 'c'])
    expect(result.legs[0].real).toBe(false)
    expect(result.legs[0].fromIdx).toBe(-1)
  })

  it('rimuove più punti consecutivi → un unico ponte tra i due estremi sopravvissuti', () => {
    const result = spliceLegsForRemovedStops(stops, legs, new Set(['a', 'b']), tappaStart)
    expect(result.stops.map(s => s.id)).toEqual(['c'])
    expect(result.legs).toHaveLength(1)
    expect(result.legs[0].real).toBe(false)
  })

  it('rimuove tutti i punti → nessuno stop, nessuna leg', () => {
    const result = spliceLegsForRemovedStops(stops, legs, new Set(['a', 'b', 'c']), tappaStart)
    expect(result.stops).toEqual([])
    expect(result.legs).toEqual([])
  })
})

describe('buildStraightLegs', () => {
  it('una leg in linea d\'aria per ogni coppia consecutiva di waypoint, mai reale', () => {
    const waypoints = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { lat: 0, lon: 2 }]
    const legs = buildStraightLegs(waypoints)
    expect(legs).toHaveLength(2)
    expect(legs.every(l => l.real === false)).toBe(true)
    expect(legs.map(l => [l.fromIdx, l.toIdx])).toEqual([[-1, 0], [0, 1]])
    expect(legs[0].distanceM).toBeGreaterThan(0)
  })

  it('un solo waypoint → nessuna leg', () => {
    expect(buildStraightLegs([{ lat: 0, lon: 0 }])).toEqual([])
  })
})

describe('summarizeTappa', () => {
  const center = { lat: 0, lon: 0 }

  it('somma distanza e tempo (cammino + visita) come groupStopsIntoTappe', () => {
    const stops = [stop('a', 'A', 0, 0), stop('b', 'B', 0, 0)]
    const legs = [leg(500), leg(500)]
    const result = summarizeTappa(stops, legs, center)
    expect(result.distanceM).toBe(1000)
    const expectedMinutes = Math.round(2 * ((500 / WALK_SPEED_MPS / 60) + visitMinutesFor({})))
    expect(result.totalMinutes).toBe(expectedMinutes)
    expect(result.startPoint).toEqual(center)
    expect(result.stops).toBe(stops)
    expect(result.legs).toBe(legs)
  })

  it('un elenco vuoto → tappa a zero, mai un errore', () => {
    const result = summarizeTappa([], [], center)
    expect(result.distanceM).toBe(0)
    expect(result.totalMinutes).toBe(0)
  })
})
