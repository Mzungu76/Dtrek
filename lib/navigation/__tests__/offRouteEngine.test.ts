// Fase 3 di docs/navigator-orizzonti-roadmap.md — prima suite di test del repository. I due
// casi principali riproducono gli esempi numerici già citati nel commento in cima a
// offRouteEngine.ts (mai verificati automaticamente prima d'ora): accuracy 5m + distanza 25m +
// trend crescente + tempo di permanenza → OFF ROUTE; accuracy 35m + distanza 20m → UNCERTAIN.
import { describe, it, expect } from 'vitest'
import { OffRouteEngine, type OffRouteSample } from '../offRouteEngine'

function sample(overrides: Partial<OffRouteSample> & { ts: number; distanceToRouteM: number }): OffRouteSample {
  return {
    accuracyM: null,
    headingDeg: null,
    expectedHeadingDeg: null,
    speedMs: null,
    ...overrides,
  }
}

describe('OffRouteEngine — adherence', () => {
  it('dichiara OFF_ROUTE dopo il dwell di default con accuracy 5m, distanza crescente da 25m', () => {
    const engine = new OffRouteEngine() // soglie di default: baseThresholdM=20, accuracySlackFactor=1 → enterThresholdM=25m con accuracy=5m; offRouteDwellMs=15s (non i "~20s" arrotondati nel commento della spec)
    const results = [0, 5000, 10000, 15000].map((ts, i) =>
      engine.update(sample({ ts, distanceToRouteM: 25 + i * 3, accuracyM: 5 })),
    )
    expect(results[0].adherence).toBe('uncertain') // sopra soglia, ma dwell non ancora trascorso
    expect(results.at(-1)!.adherence).toBe('off_route')
  })

  it('non dichiara mai OFF_ROUTE se la distanza rientra prima che il dwell trascorra', () => {
    const engine = new OffRouteEngine()
    engine.update(sample({ ts: 0, distanceToRouteM: 25, accuracyM: 5 }))
    engine.update(sample({ ts: 5000, distanceToRouteM: 28, accuracyM: 5 }))
    const backOnRoute = engine.update(sample({ ts: 10000, distanceToRouteM: 5, accuracyM: 5 }))
    expect(backOnRoute.adherence).not.toBe('off_route')
  })

  it('resta UNCERTAIN con accuracy 35m e distanza 20m, anche su un solo campione', () => {
    const engine = new OffRouteEngine()
    const result = engine.update(sample({ ts: 0, distanceToRouteM: 20, accuracyM: 35 }))
    expect(result.adherence).toBe('uncertain')
  })

  it('non resta UNCERTAIN per sempre se la distanza è troppo grande per essere solo rumore GPS (sanityDistanceM)', () => {
    const engine = new OffRouteEngine()
    // accuracy pessima (35m, sopra uncertainAccuracyThresholdM) ma distanza (150m) oltre
    // sanityDistanceM (100m di default) — non più spiegabile come rumore, va verso OFF_ROUTE.
    const results = [0, 5000, 10000, 15000].map((ts) =>
      engine.update(sample({ ts, distanceToRouteM: 150, accuracyM: 35 })),
    )
    expect(results.at(-1)!.adherence).toBe('off_route')
  })
})

describe('OffRouteEngine — wrong_direction', () => {
  it('segnala wrong_direction solo dopo il dwell, quando si è sul percorso ma con rotta opposta', () => {
    const engine = new OffRouteEngine()
    const onRoute = { distanceToRouteM: 5, accuracyM: 5 }
    const early = engine.update(sample({ ts: 0, ...onRoute, headingDeg: 0, expectedHeadingDeg: 180, speedMs: 1 }))
    const late = engine.update(sample({ ts: 8000, ...onRoute, headingDeg: 0, expectedHeadingDeg: 180, speedMs: 1 }))
    expect(early.wrongDirection).toBe(false) // wrongDirectionDwellMs di default è 8000ms, non ancora trascorso al primo campione
    expect(late.wrongDirection).toBe(true)
  })

  it('non valuta wrong_direction sotto la soglia minima di velocità (escursionista fermo)', () => {
    const engine = new OffRouteEngine()
    const onRoute = { distanceToRouteM: 5, accuracyM: 5 }
    const result = engine.update(sample({ ts: 0, ...onRoute, headingDeg: 0, expectedHeadingDeg: 180, speedMs: 0.1 }))
    expect(result.wrongDirection).toBe(false)
  })

  it('azzera subito wrong_direction quando si esce da on_route, senza aspettare un dwell', () => {
    const engine = new OffRouteEngine()
    const onRoute = { distanceToRouteM: 5, accuracyM: 5 }
    engine.update(sample({ ts: 0, ...onRoute, headingDeg: 0, expectedHeadingDeg: 180, speedMs: 1 }))
    engine.update(sample({ ts: 8000, ...onRoute, headingDeg: 0, expectedHeadingDeg: 180, speedMs: 1 }))
    // Ora ben oltre soglia di uscita dal percorso — wrong_direction non ha più senso geometrico.
    const offRoute = engine.update(sample({ ts: 8500, distanceToRouteM: 200, accuracyM: 5 }))
    expect(offRoute.wrongDirection).toBe(false)
  })
})
