/**
 * Verifica di regressione — Trail Score v2 (lib/trailScoreV2.ts).
 *
 * Il punteggio è `CTS * gate(Sicurezza)` — Ombra&Acqua e Affidabilità (CL) sono stati rimossi
 * dal prodotto (vedi il changelog per il perché). Nessun test framework in questo repo (vedi
 * scripts/probe-*.ts) — script standalone, stesso pattern.
 *
 * Usage:
 *   npx tsx scripts/verify-trailscore-v2.ts
 */

import {
  computeTrailScoreV2, safetyGate,
  SAFETY_GATE_S0, SAFETY_GATE_RAMP_P, SAFETY_VETO_THRESHOLD,
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

console.log('--- Verifica numerica: Percorso A vs B ---')

// Percorso A: Sicurezza 90, CTS 60
const a = computeTrailScoreV2({ cts: 60, safety: 90 })
checkTrue('Percorso A calcolabile', a !== null)
if (a) {
  check('A — CTS', a.breakdown.value, 60, 0.05)
  check('A — gate g(90)', a.breakdown.gate, 0.945, 0.01)
  check('A — TS_finale', a.score, 56.7, 0.15)
  checkBool('A — non vetoed', a.breakdown.vetoed, false)
}

// Percorso B: Sicurezza 40, CTS 80
const b = computeTrailScoreV2({ cts: 80, safety: 40 })
checkTrue('Percorso B calcolabile', b !== null)
if (b) {
  check('B — CTS', b.breakdown.value, 80, 0.05)
  check('B — gate g(40)', b.breakdown.gate, 0.583, 0.01)
  check('B — TS_finale', b.score, 46.6, 0.15)
  checkBool('B — non vetoed', b.breakdown.vetoed, false)
}

if (a && b) {
  checkTrue(
    'A batte B nonostante CTS più basso — la Sicurezza migliore pesa più del CTS leggermente più alto di B',
    a.score > b.score,
  )
}

console.log('\n--- Parametri di default (coerenza coi valori citati dalla spec) ---')
checkTrue('SAFETY_GATE_S0 = 35', SAFETY_GATE_S0 === 35)
checkTrue('SAFETY_GATE_RAMP_P = 0.7', SAFETY_GATE_RAMP_P === 0.7)
checkTrue('SAFETY_VETO_THRESHOLD = 15', SAFETY_VETO_THRESHOLD === 15)

console.log('\n--- Gate: valori di riferimento (sigmoide sotto S0, rampa più dolce sopra) ---')
check('g(35) = 0.5 (soglia, continuità tra i due rami)', safetyGate(35), 0.5, 0.001)
check('g(90) ≈ 0.945 (rampa sopra S0, non più quasi-saturo a 0.99)', safetyGate(90), 0.945, 0.01)
check('g(15) ≈ 0.076-0.12 (banda "Pericoloso", ramo sigmoide invariato)', safetyGate(15), 0.10, 0.05)
check('g(60) ≈ 0.76 (fascia "Moderato/Basso rischio" ora differenziata)', safetyGate(60), 0.756, 0.02)

console.log('\n--- Guardie sui campi obbligatori (nessun default onesto per un gate assente) ---')
checkTrue('cts assente ⇒ null', computeTrailScoreV2({ cts: null, safety: 80 }) === null)
checkTrue('safety assente ⇒ null', computeTrailScoreV2({ cts: 50, safety: null }) === null)

console.log('\n--- Veto (Sicurezza < 15) ---')
const dangerous = computeTrailScoreV2({ cts: 90, safety: 10 })
checkTrue('Sicurezza 10 ⇒ vetoed', !!dangerous?.breakdown.vetoed)
const safe = computeTrailScoreV2({ cts: 90, safety: 15 })
checkTrue('Sicurezza 15 (soglia esatta, non < 15) ⇒ non vetoed', safe?.breakdown.vetoed === false)

console.log(`\n${failures === 0 ? '✅ Tutti i controlli passati.' : `❌ ${failures} controlli falliti.`}`)
if (failures > 0) process.exit(1)
