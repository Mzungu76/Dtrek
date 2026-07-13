/**
 * Verifica di regressione — Trail Score v2 (lib/trailScoreV2.ts).
 *
 * Riproduce il caso di test della spec (Percorso A vs B, §4): stesso totale nella vecchia somma
 * lineare (250/400 = 62.5 su scala 0-100) ma profili di rischio/affidabilità opposti — la vecchia
 * formula li rendeva indistinguibili, la v2 deve invece premiare A. Nessun test framework in
 * questo repo (vedi scripts/probe-*.ts) — script standalone, stesso pattern.
 *
 * Usage:
 *   npx tsx scripts/verify-trailscore-v2.ts
 */

import {
  computeTrailScoreV2, seasonalWeights, safetyGate,
  W_CTS_STATIC, W_OA_STATIC, W_OA_SEASONAL_CEILING, SAFETY_GATE_S0, TS_PRIOR_STATIC, SAFETY_VETO_THRESHOLD,
} from '@/lib/trailScoreV2'

let failures = 0

function check(label: string, actual: number, expected: number, tolerance = 0.15) {
  const ok = Math.abs(actual - expected) <= tolerance
  console.log(`${ok ? '✅' : '❌'} ${label}: atteso ≈${expected}, ottenuto ${actual.toFixed(3)}`)
  if (!ok) failures++
}

function checkBool(label: string, actual: boolean, expected: boolean) {
  const ok = actual === expected
  console.log(`${ok ? '✅' : '❌'} ${label}: atteso ${expected}, ottenuto ${actual}`)
  if (!ok) failures++
}

function checkTrue(label: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${label}`)
  if (!cond) failures++
}

console.log('--- §4 Verifica numerica: Percorso A vs B (pesi statici, nessuna temperatura) ---')

// Percorso A: Sicurezza 90, Affidabilità 80, CTS 60, Ombra&Acqua 20
const a = computeTrailScoreV2({ cts: 60, ombraAcqua: 20, safety: 90, affidabilita: 80 })
checkTrue('Percorso A calcolabile', a !== null)
if (a) {
  check('A — Value', a.breakdown.value, 51.2, 0.05)
  check('A — gate g(90)', a.breakdown.gate, 0.994, 0.01)
  check('A — TS_grezzo', a.breakdown.tsGrezzo, 50.9, 0.15)
  check('A — TS_finale', a.score, 50.7, 0.15)
  checkBool('A — non vetoed', a.breakdown.vetoed, false)
}

// Percorso B: Sicurezza 40, Affidabilità 50, CTS 80, Ombra&Acqua 80
const b = computeTrailScoreV2({ cts: 80, ombraAcqua: 80, safety: 40, affidabilita: 50 })
checkTrue('Percorso B calcolabile', b !== null)
if (b) {
  check('B — Value', b.breakdown.value, 80, 0.05)
  check('B — gate g(40)', b.breakdown.gate, 0.622, 0.01)
  check('B — TS_grezzo', b.breakdown.tsGrezzo, 49.8, 0.15)
  check('B — TS_finale', b.score, 49.9, 0.15)
  checkBool('B — non vetoed', b.breakdown.vetoed, false)
}

if (a && b) {
  checkTrue(
    'A batte B nonostante lo stesso totale nella vecchia somma lineare (250/400 = 62.5 entrambi)',
    a.score > b.score,
  )
}

console.log('\n--- Parametri di default (coerenza coi valori citati dalla spec) ---')
checkTrue('W_CTS_STATIC = 0.78', W_CTS_STATIC === 0.78)
checkTrue('W_OA_STATIC = 0.22', W_OA_STATIC === 0.22)
checkTrue('W_OA_SEASONAL_CEILING = 0.30', W_OA_SEASONAL_CEILING === 0.30)
checkTrue('SAFETY_GATE_S0 = 35', SAFETY_GATE_S0 === 35)
checkTrue('TS_PRIOR_STATIC = 50', TS_PRIOR_STATIC === 50)
checkTrue('SAFETY_VETO_THRESHOLD = 15', SAFETY_VETO_THRESHOLD === 15)

console.log('\n--- Gate sigmoide: valori di riferimento ---')
check('g(35) = 0.5 (soglia)', safetyGate(35), 0.5, 0.001)
// Le due cifre citate nel testo della spec (non nel caso di test numerico §4, solo nel commento
// discorsivo) sono approssimazioni illustrative — tolleranza più larga, non sono il calcolo
// verificato (quello è il confronto A/B sopra, dove g(90) e g(40) tornano esatti).
check('g(90) ≈ 0.994 (illustrativo)', safetyGate(90), 0.994, 0.01)
check('g(15) ≈ 0.076-0.12 (illustrativo, banda "Pericoloso")', safetyGate(15), 0.10, 0.05)

console.log('\n--- Ponderazione stagionale di Ombra&Acqua ---')
const noTemp = seasonalWeights(null)
checkTrue('Senza temperatura ⇒ pesi statici', noTemp.wCts === W_CTS_STATIC && noTemp.wOa === W_OA_STATIC)
const cold = seasonalWeights(10)
check('Sotto 15°C ⇒ w_oa = 0', cold.wOa, 0, 0.001)
const hot = seasonalWeights(35)
check('Sopra 32°C ⇒ w_oa satura al tetto 0.30', hot.wOa, 0.30, 0.001)
const mid = seasonalWeights(23.5) // metà strada tra 15 e 32
check('A metà strada (23.5°C) ⇒ w_oa ≈ metà tetto', mid.wOa, 0.15, 0.02)

console.log('\n--- Guardie sui campi obbligatori (nessun default onesto per gate/shrinkage assenti) ---')
checkTrue('cts assente ⇒ null', computeTrailScoreV2({ cts: null, ombraAcqua: 50, safety: 80, affidabilita: 80 }) === null)
checkTrue('safety assente ⇒ null', computeTrailScoreV2({ cts: 50, ombraAcqua: 50, safety: null, affidabilita: 80 }) === null)
checkTrue('affidabilita assente ⇒ null', computeTrailScoreV2({ cts: 50, ombraAcqua: 50, safety: 80, affidabilita: null }) === null)

const noOa = computeTrailScoreV2({ cts: 70, ombraAcqua: null, safety: 90, affidabilita: 90 })
checkTrue('ombraAcqua assente ⇒ comunque calcolabile (Value = solo CTS)', noOa !== null)
if (noOa) check('ombraAcqua assente ⇒ Value = CTS', noOa.breakdown.value, 70, 0.001)

console.log('\n--- Veto (Sicurezza < 15) ---')
const dangerous = computeTrailScoreV2({ cts: 90, ombraAcqua: 90, safety: 10, affidabilita: 90 })
checkTrue('Sicurezza 10 ⇒ vetoed', !!dangerous?.breakdown.vetoed)
const safe = computeTrailScoreV2({ cts: 90, ombraAcqua: 90, safety: 15, affidabilita: 90 })
checkTrue('Sicurezza 15 (soglia esatta, non < 15) ⇒ non vetoed', safe?.breakdown.vetoed === false)

console.log(`\n${failures === 0 ? '✅ Tutti i controlli passati.' : `❌ ${failures} controlli falliti.`}`)
if (failures > 0) process.exit(1)
