/**
 * Verifica di regressione — TEI v2 dopo la revisione "assenza ≠ punizione" + preferenza di
 * sforzo per V_topo/V_geo + pesi personalizzabili (lib/tei.ts).
 *
 * Nessun test framework in questo repo — script standalone, stesso pattern di
 * scripts/verify-trailscore-v2.ts.
 *
 * Usage:
 *   npx tsx scripts/verify-tei.ts
 */
import { computeTEI, normalizeTeiWeights } from '@/lib/tei'
import type { PoiItem } from '@/lib/overpass'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'

let failures = 0

function check(label: string, actual: number, expected: number, tolerance: number) {
  const ok = Math.abs(actual - expected) <= tolerance
  console.log(`${ok ? '✅' : '❌'} ${label}: atteso ≈${expected} (±${tolerance}), ottenuto ${actual.toFixed(2)}`)
  if (!ok) failures++
}

function checkTrue(label: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${label}`)
  if (!cond) failures++
}

// ── Tracce sintetiche ─────────────────────────────────────────────────────────

function flatTrack(nPoints: number, stepDeg: number): { track: [number, number][]; elevProfile: number[] } {
  const track: [number, number][] = []
  const elevProfile: number[] = []
  for (let i = 0; i < nPoints; i++) {
    track.push([42 + i * stepDeg, 12])
    elevProfile.push(500) // quota costante — nessun dislivello
  }
  return { track, elevProfile }
}

// elevProfile qui è solo un fallback (non usato per la pendenza quando c'è un dtmProfile 'dtm',
// vedi computeTopoIntensity) — il segnale vero e controllabile viene dai gradi di pendenza
// espliciti in buildSteepDtmProfile qui sotto, alternati tra dolce/ripido per generare varianza
// alta e una buona quota di segmenti nella fascia "ottimale" (10-25% ≈ 5.7°-14°).
function steepTrack(nPoints: number, stepDeg: number): { track: [number, number][]; elevProfile: number[] } {
  const track: [number, number][] = []
  const elevProfile: number[] = []
  for (let i = 0; i < nPoints; i++) {
    track.push([42 + i * stepDeg, 12])
    elevProfile.push(500 + i * 5)
  }
  return { track, elevProfile }
}

function buildSteepDtmProfile(track: [number, number][]): TrailDtmProfile {
  const points = track.map(([lat, lon], i) => ({
    lat, lon,
    slopeDeg: i % 2 === 0 ? 8 : 30, // alterna pendenza "ottimale" (~14%) e ripida (~58%)
    aspectDeg: NaN,
  }))
  return { source: 'dtm', points, avgSlopeDeg: 19, maxSlopeDeg: 30 }
}

const NO_POIS: PoiItem[] = []
const DISTANCE_M = 5000 // 5km

console.log('--- V_cult / V_idro: assenza ⇒ neutro (5), non più punitivo (2/1) ---')
const flat = flatTrack(60, 0.001)
const noSignal = computeTEI({
  track: flat.track, elevGain: 0, distanceMeters: DISTANCE_M, elevProfile: flat.elevProfile,
  pois: NO_POIS, prefSforzo: 50,
})
check('V_cult senza siti culturali nei paraggi', noSignal.breakdown.vCult, 5, 0.01)
check('V_idro senza acqua nei paraggi', noSignal.breakdown.vIdro, 5, 0.01)
checkTrue('TEI non crolla per la sola assenza di acqua/cultura (era strutturalmente "Basso")', noSignal.score > 3.5)

console.log('\n--- V_topo/V_geo: legati a prefSforzo, non più assoluti ---')
const flatEasy = computeTEI({
  track: flat.track, elevGain: 0, distanceMeters: DISTANCE_M, elevProfile: flat.elevProfile,
  pois: NO_POIS, prefSforzo: 10, // vuole una passeggiata facile
})
const flatHard = computeTEI({
  track: flat.track, elevGain: 0, distanceMeters: DISTANCE_M, elevProfile: flat.elevProfile,
  pois: NO_POIS, prefSforzo: 90, // cerca sfida
})
checkTrue(
  'Percorso pianeggiante: chi vuole una passeggiata facile lo vede premiato su V_topo rispetto a chi cerca sfida',
  flatEasy.breakdown.vTopo > flatHard.breakdown.vTopo,
)
check('V_topo pianeggiante per chi vuole facile ⇒ alto', flatEasy.breakdown.vTopo, 10, 1.5)
check('V_topo pianeggiante per chi cerca sfida ⇒ basso', flatHard.breakdown.vTopo, 1, 1.5)

const steep = steepTrack(60, 0.001)
const steepDtm = buildSteepDtmProfile(steep.track)
const steepEasy = computeTEI({
  track: steep.track, elevGain: 1200, distanceMeters: DISTANCE_M, elevProfile: steep.elevProfile,
  pois: NO_POIS, dtmProfile: steepDtm, prefSforzo: 10,
})
const steepHard = computeTEI({
  track: steep.track, elevGain: 1200, distanceMeters: DISTANCE_M, elevProfile: steep.elevProfile,
  pois: NO_POIS, dtmProfile: steepDtm, prefSforzo: 90,
})
checkTrue(
  'Percorso ripido/vario: chi cerca sfida lo vede premiato su V_topo rispetto a chi vuole facile',
  steepHard.breakdown.vTopo > steepEasy.breakdown.vTopo,
)

console.log('\n--- Pesi personalizzabili: default replica esattamente i pesi storici ---')
const w = normalizeTeiWeights()
check('cultura → 0.20', w.cultura, 0.20, 0.001)
check('topografia → 0.30', w.topografia, 0.30, 0.001)
check('idrografia → 0.20', w.idrografia, 0.20, 0.001)
check('fondo → 0.20', w.fondo, 0.20, 0.001)
check('geodiversità → 0.10', w.geodiversita, 0.10, 0.001)

const onlyCultura = normalizeTeiWeights({ cultura: 100, topografia: 0, idrografia: 0, fondo: 0, geodiversita: 0 })
check('peso esclusivo su cultura ⇒ cultura=1, resto=0', onlyCultura.cultura, 1, 0.001)
check('peso esclusivo su cultura ⇒ topografia=0', onlyCultura.topografia, 0, 0.001)

console.log('\n--- f_antr: sensibilità utente ---')
const trackWithAsphalt = flatTrack(20, 0.001)
const antrHighways = trackWithAsphalt.track.map(([lat, lon]) => ({ lat, lon, tags: { highway: 'primary' } }))
const ignora = computeTEI({
  track: trackWithAsphalt.track, elevGain: 0, distanceMeters: 1000, elevProfile: trackWithAsphalt.elevProfile,
  pois: NO_POIS, osmData: { waterways: [], highways: [], antrHighways, powerLines: [] },
  fAntrSensitivity: 'ignora',
})
const fastidio = computeTEI({
  track: trackWithAsphalt.track, elevGain: 0, distanceMeters: 1000, elevProfile: trackWithAsphalt.elevProfile,
  pois: NO_POIS, osmData: { waterways: [], highways: [], antrHighways, powerLines: [] },
  fAntrSensitivity: 'fastidio',
})
check('"Non mi importa" ⇒ f_antr azzerato', ignora.breakdown.fAntr, 0, 0.001)
checkTrue('"Mi dà fastidio" ⇒ f_antr più alto di "Normale"', fastidio.breakdown.fAntr > 0)

console.log(`\n${failures === 0 ? '✅ Tutti i controlli passati.' : `❌ ${failures} controlli falliti.`}`)
if (failures > 0) process.exit(1)
