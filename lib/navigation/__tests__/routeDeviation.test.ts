// DTREK-AUDIT.md — P0 #2: RouteTracker cercava il segmento più vicino solo in una finestra
// scorrevole di ±15 indici, senza alcun modo di recuperare dopo un salto ampio di posizione (es.
// dopo gps_lost/app in background) — su un percorso con tornanti/incroci questo poteva agganciare
// silenziosamente il tracker al segmento sbagliato ma vicino ("falso on-route"). Questi test
// coprono sia il comportamento invariato (nessuna regressione, locality preservata quando non c'è
// alcun segnale di salto) sia il meccanismo di recupero esplicito (forceFullScan).
//
// Nota: la prima versione di questo fix includeva anche un fallback AUTOMATICO (nessun hint dal
// chiamante, solo "la distanza windowed è troppo grande") — rimosso dopo aver rotto un test su
// un'escursione reale registrata su un percorso ad anello (realRouteSimulation.test.ts): un
// escursionista genuinamente fuori sentiero di qualche centinaio di metri può trovarsi, per pura
// geometria, più vicino a un tratto diverso dello stesso anello che al proprio tratto reale — la
// scansione completa "correggeva" quel caso saltando su un punto sbagliato del percorso, peggio
// del risultato windowed che almeno restava sul tratto giusto. Solo un segnale di discontinuità
// reale (forceFullScan) può distinguere "sono fuori sentiero" da "l'ultima posizione nota era su
// un altro tratto della rete sentieri" — la sola distanza non basta.
import { describe, it, expect } from 'vitest'
import { RouteTracker } from '../routeDeviation'

const LAT0 = 45.0
const M_PER_DEG_LAT = 111320
const M_PER_DEG_LON = 111320 * Math.cos(LAT0 * Math.PI / 180)

/** Offset (lat, lon) by a given distance north/east, in meters — same equirectangular
 * approximation style already used elsewhere in the codebase (lib/geoUtils.ts's
 * circlePolygonLonLat), just for building test fixtures, not part of the module under test. */
function offset(lat: number, lon: number, dNorthM: number, dEastM: number): [number, number] {
  return [lat + dNorthM / M_PER_DEG_LAT, lon + dEastM / (M_PER_DEG_LON)]
}

/** A simple straight track, points 10m apart heading east — for tests where locality/jump
 * detection doesn't need a self-crossing geometry. */
function buildStraightTrack(n: number, stepM = 10): [number, number][] {
  const track: [number, number][] = []
  for (let i = 0; i < n; i++) track.push(offset(LAT0, 7.0, 0, i * stepM))
  return track
}

/**
 * A "hairpin" track: an outbound leg (indices 0..99, heading east) and a return leg (indices
 * 100..199, parallel ~5m to the north, walked in reverse) — so track[179] sits ~5m from
 * track[20] in space, but 159 indices away (well outside the default ±15 search window). This is
 * exactly the failure geometry the audit describes: two segments close in space, far in index.
 */
function buildHairpinTrack(): [number, number][] {
  const track: [number, number][] = []
  for (let i = 0; i < 100; i++) track.push(offset(LAT0, 7.0, 0, i * 10))
  for (let j = 0; j < 100; j++) track.push(offset(LAT0, 7.0, 5, (99 - j) * 10))
  return track
}

describe('RouteTracker — comportamento windowed di base (nessuna regressione)', () => {
  it('in cammino continuo su un tracciato semplice, nearestSegmentIndex avanza e distanceToRouteM resta piccolo', () => {
    const track = buildStraightTrack(60)
    const tracker = new RouteTracker(track)
    let lastIdx = 0
    for (const i of [0, 5, 10, 20, 30, 45, 55]) {
      const [lat, lon] = track[i]
      const progress = tracker.update(lat, lon)
      expect(progress.distanceToRouteM).toBeLessThan(1)
      expect(progress.nearestSegmentIndex).toBeGreaterThanOrEqual(lastIdx)
      lastIdx = progress.nearestSegmentIndex
    }
  })
})

describe('RouteTracker — locality preservata senza segnale di salto', () => {
  it('senza forceFullScan resta agganciato al ramo vicino in indice anche se il ramo di ritorno è più vicino nello spazio (there-and-back voluto)', () => {
    const track = buildHairpinTrack()
    const tracker = new RouteTracker(track)

    // Cammina normalmente lungo il ramo di andata fino a portare lastSegmentIndex vicino a 20 —
    // ogni passo resta dentro la finestra di ricerca del precedente (±15), come in un'escursione reale.
    for (const i of [0, 10, 20]) {
      const [lat, lon] = track[i]
      tracker.update(lat, lon)
    }

    // Fix fisicamente sul ramo di ritorno (track[179], ~5m a nord di track[20]) — NESSUN segnale
    // di salto. La finestra (±15 attorno a ~20) non arriva mai a 179: deve restare agganciata al
    // ramo di andata, con una distanza di ~5m (l'offset reale), non ~0m.
    const [retLat, retLon] = track[179]
    const progress = tracker.update(retLat, retLon)

    expect(progress.nearestSegmentIndex).toBeLessThan(40) // resta sul ramo di andata, non salta a ~179
    expect(progress.distanceToRouteM).toBeGreaterThan(3)
    expect(progress.distanceToRouteM).toBeLessThan(8) // ~5m di offset reale tra i due rami, non un salto enorme
  })
})

describe('RouteTracker — forceFullScan', () => {
  it('con forceFullScan trova il ramo di ritorno anche se lontano ~160 indici da lastSegmentIndex', () => {
    const track = buildHairpinTrack()
    const tracker = new RouteTracker(track)

    for (const i of [0, 10, 20]) {
      const [lat, lon] = track[i]
      tracker.update(lat, lon)
    }

    const [retLat, retLon] = track[179]
    const progress = tracker.update(retLat, retLon, { forceFullScan: true })

    expect(progress.nearestSegmentIndex).toBeGreaterThanOrEqual(178)
    expect(progress.nearestSegmentIndex).toBeLessThanOrEqual(180)
    expect(progress.distanceToRouteM).toBeLessThan(1)
  })

  it('senza forceFullScan, un salto isolato lontano dalla finestra (senza alcuna geometria ambigua) resta agganciato alla finestra locale — nessuna scansione automatica', () => {
    const track = buildStraightTrack(200)
    const tracker = new RouteTracker(track)

    tracker.update(track[0][0], track[0][1]) // lastSegmentIndex ~0

    const [farLat, farLon] = track[190] // ~1900m dalla finestra corrente
    const progress = tracker.update(farLat, farLon)

    // Nessun segnale di salto: il tracker non prova nemmeno a cercare altrove, resta nella
    // finestra attorno all'ultimo indice noto — comportamento voluto (vedi nota in testa al file).
    expect(progress.nearestSegmentIndex).toBeLessThan(20)
    expect(progress.distanceToRouteM).toBeGreaterThan(1000)
  })
})

describe('RouteTracker — caso limite track.length < 2', () => {
  it('con un tracciato vuoto o di un solo punto restituisce i valori di default senza lanciare', () => {
    for (const track of [[], [[45.0, 7.0]] as [number, number][]]) {
      const tracker = new RouteTracker(track as [number, number][])
      const progress = tracker.update(45.001, 7.001)
      expect(progress.nearestSegmentIndex).toBe(0)
      expect(progress.distanceToRouteM).toBe(Infinity)
      expect(progress.distanceAlongRouteM).toBe(0)
      expect(progress.totalRouteM).toBe(0)
      expect(progress.expectedBearingDeg).toBeNull()
      expect(progress.nearestPointLat).toBe(45.001)
      expect(progress.nearestPointLon).toBe(7.001)
    }
  })
})
