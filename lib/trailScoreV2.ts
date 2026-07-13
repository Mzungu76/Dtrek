// Trail Score v2 — sostituisce la somma lineare (CL + Sicurezza + Comfort TrailScore + Ombra&Acqua,
// 0-400) con un framework MCDA a 3 livelli non-compensatorio. Vedi la spec allegata
// (trailscorev2spec.md) per la derivazione completa; qui solo l'implementazione.
//
// Livello 1 — Value: CTS e Ombra&Acqua misurano entrambi "quanto è piacevole" il percorso, quindi
// sono legittimamente sostituibili tra loro (media pesata, pesi dinamici in base alla temperatura
// prevista se disponibile).
// Livello 2 — Constraint gate: la Sicurezza non è un addendo ma un moltiplicatore sigmoide che
// collassa il Value quando il rischio supera una soglia — non compensabile da nessun'altra bontà.
// Livello 3 — Epistemic shrinkage: l'Affidabilità non è merito del percorso, è quanto fidarsi del
// punteggio appena calcolato — media bayesiana di credibilità verso un prior neutro.
//
// Scala di output: 0-100 (non più 0-400).

export const W_CTS_STATIC = 0.78
export const W_OA_STATIC = 0.22
// Tetto massimo che Ombra&Acqua può pesare anche nel giorno più caldo, quando si usa la
// ponderazione stagionale dinamica al posto dei pesi statici sopra.
export const W_OA_SEASONAL_CEILING = 0.30
export const SEASONAL_T_MIN = 15 // °C — sotto questa soglia w_oa → 0 (non pesa in inverno)
export const SEASONAL_T_MAX = 32 // °C — sopra questa soglia w_oa satura al tetto

// Soglia e pendenza del gate sigmoide sulla Sicurezza (Livello 2). S0 nella spec è descritto come
// "il confine Moderato/Elevato della scala esistente" — la scala di lib/safetyScore.ts ha in
// realtà quel confine a 20 (Elevato ≥20, Moderato ≥40), non 35: i due valori di default restano
// comunque quelli indicati esplicitamente dalla spec (verificati contro il caso di test §4), la
// discrepanza è solo nella frase di motivazione, non nel parametro stesso.
export const SAFETY_GATE_S0 = 35
export const SAFETY_GATE_K = 0.10

// Valore neutro verso cui collassa TS_finale quando l'Affidabilità è bassa (shrinkage, Livello 3).
// Statico per ora — l'alternativa dinamica (mediana dei TS_grezzo dei percorsi vicini) richiede
// volumi di percorsi per area che DTrek non ha ancora; vedi §2/§6 della spec.
export const TS_PRIOR_STATIC = 50

// Sotto questa soglia di Sicurezza assoluta ("banda Pericoloso" nella spec) il gate sigmoide ha
// già schiacciato il Value quasi a zero (g(15)≈0.076) — in più, mostriamo un badge di veto
// testuale sovrapposto al numero (non sostitutivo), invece di limitarci al solo effetto numerico.
export const SAFETY_VETO_THRESHOLD = 15

export interface TrailScoreV2Weights {
  wCts: number
  wOa: number
}

/** Pesi di Value (Livello 1) — statici (0.78/0.22) se la temperatura prevista non è disponibile,
 *  altrimenti dinamici in base a quanto la giornata è calda (Ombra&Acqua conta di più quando fa
 *  caldo, quasi nulla sotto i 15°C). */
export function seasonalWeights(forecastTempC: number | null | undefined): TrailScoreV2Weights {
  if (forecastTempC == null || Number.isNaN(forecastTempC)) {
    return { wCts: W_CTS_STATIC, wOa: W_OA_STATIC }
  }
  const t = Math.max(0, Math.min(1, (forecastTempC - SEASONAL_T_MIN) / (SEASONAL_T_MAX - SEASONAL_T_MIN)))
  const wOa = W_OA_SEASONAL_CEILING * t
  return { wCts: 1 - wOa, wOa }
}

/** Gate sigmoide della Sicurezza (Livello 2) — 1 = nessun effetto, 0 = azzera il Value. */
export function safetyGate(safety: number): number {
  return 1 / (1 + Math.exp(-SAFETY_GATE_K * (safety - SAFETY_GATE_S0)))
}

export interface TrailScoreV2Breakdown {
  wCts: number
  wOa: number
  value: number
  gate: number
  tsGrezzo: number
  c: number
  tsPrior: number
  vetoed: boolean
}

export interface TrailScoreV2Result {
  score: number // 0-100
  breakdown: TrailScoreV2Breakdown
}

export interface TrailScoreV2Input {
  /** Comfort TrailScore, 0-100. Richiesto: senza non è possibile calcolare il Value. */
  cts: number | null
  /** Ombra e Acqua, 0-100 (non 0-1: già scalato dal chiamante). Assente ⇒ Value = solo CTS
   *  (w_oa forzato a 0), coerente con l'idea di Livello 1 che i due sono sostituibili tra loro. */
  ombraAcqua: number | null
  /** Punteggio Sicurezza, 0-100. Richiesto: senza non si può applicare il gate in sicurezza
   *  (un gate assente equivarrebbe ad assumere rischio nullo, cosa che non sappiamo). */
  safety: number | null
  /** Affidabilità già corretta per densità dati (lib/cl/signals/densitySignal.ts), 0-100.
   *  Richiesto: senza non si può calcolare lo shrinkage bayesiano C. */
  affidabilita: number | null
  /** Temperatura prevista (°C) nel giorno dell'escursione, se disponibile — vedi
   *  app/guida/useForecastTemp.ts. Assente ⇒ pesi statici (nessuna ponderazione stagionale). */
  forecastTempC?: number | null
  /** TS_prior — valore neutro dello shrinkage. Default statico (50); vedi TS_PRIOR_STATIC. */
  tsPrior?: number
}

/**
 * Calcola il Trail Score v2 (0-100). Restituisce null quando manca uno degli input strutturali
 * (CTS, Sicurezza o Affidabilità) — un formula non-compensatoria come questa non ha un modo
 * onesto di degradare con un default neutro per un gate o uno shrinkage mancante (un gate
 * "assente" equivarrebbe a assumere rischio zero, uno shrinkage "assente" equivarrebbe ad
 * assumere dati affidabili al 100%): meglio non mostrare il numero finché tutti e tre non sono
 * pronti, piuttosto che mostrarne uno silenziosamente sbagliato in un senso o nell'altro.
 * Ombra&Acqua invece è genuinamente sostituibile con CTS (Livello 1), quindi la sua assenza
 * degrada correttamente a w_oa=0 invece di bloccare il calcolo.
 */
export function computeTrailScoreV2(input: TrailScoreV2Input): TrailScoreV2Result | null {
  const { cts, ombraAcqua, safety, affidabilita, forecastTempC, tsPrior = TS_PRIOR_STATIC } = input
  if (cts == null || safety == null || affidabilita == null) return null

  const { wCts, wOa } = ombraAcqua == null
    ? { wCts: 1, wOa: 0 }
    : seasonalWeights(forecastTempC)

  const value = wCts * cts + wOa * (ombraAcqua ?? 0)
  const gate = safetyGate(safety)
  const tsGrezzo = value * gate
  const c = Math.max(0, Math.min(1, affidabilita / 100))
  const tsFinale = c * tsGrezzo + (1 - c) * tsPrior
  const vetoed = safety < SAFETY_VETO_THRESHOLD

  return {
    score: Math.max(0, Math.min(100, tsFinale)),
    breakdown: { wCts, wOa, value, gate, tsGrezzo, c, tsPrior, vetoed },
  }
}
