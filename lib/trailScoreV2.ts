// Trail Score v2 — applica al Comfort TrailScore (CTS) un gate sigmoide non-compensabile sulla
// Sicurezza: un percorso rischioso non può essere "salvato" da quanto è bello o comodo.
//
// Scala di output: 0-100.

// Soglia e pendenza del gate sigmoide sulla Sicurezza. S0 nella spec è descritto come "il
// confine Moderato/Elevato della scala esistente" — la scala di lib/safetyScore.ts ha in realtà
// quel confine a 20 (Elevato ≥20, Moderato ≥40), non 35: i due valori di default restano
// comunque quelli indicati esplicitamente dalla spec (verificati contro il caso di test §4), la
// discrepanza è solo nella frase di motivazione, non nel parametro stesso.
export const SAFETY_GATE_S0 = 35
export const SAFETY_GATE_K = 0.10
// Sopra S0 il vecchio gate (lo stesso sigmoide, semplicemente proseguito) saturava quasi subito
// verso 1.0 — già 0.92 a Sicurezza 60, 0.99 a 80: la stragrande maggioranza dei percorsi
// pianificati normalmente, che NON sono pericolosi, finiva con un gate pressoché costante, senza
// alcuna differenziazione reale tra "abbastanza sicuro" e "molto sicuro". Sopra la soglia il gate
// ora sale con una curva più dolce (esponente <1, forte recupero appena sopra S0 così un percorso
// "Moderato" non crolla, ma continua comunque a differenziare fino a "Sicuro") invece di saturare.
export const SAFETY_GATE_RAMP_P = 0.7

// Sotto questa soglia di Sicurezza assoluta ("banda Pericoloso" nella spec) il gate sigmoide ha
// già schiacciato il CTS quasi a zero (g(15)≈0.076) — in più, mostriamo un badge di veto
// testuale sovrapposto al numero (non sostitutivo), invece di limitarci al solo effetto numerico.
export const SAFETY_VETO_THRESHOLD = 15

/** Gate della Sicurezza — 1 = nessun effetto, 0 = azzera il CTS. Sotto S0 resta il sigmoide
 *  ripido di sempre (il "veto" su un percorso davvero pericoloso non cambia); sopra S0 sale con
 *  una curva più dolce fino a 1.0 — vedi il commento su SAFETY_GATE_RAMP_P sul perché. */
export function safetyGate(safety: number): number {
  if (safety <= SAFETY_GATE_S0) {
    return 1 / (1 + Math.exp(-SAFETY_GATE_K * (safety - SAFETY_GATE_S0)))
  }
  return 0.5 + 0.5 * Math.pow((safety - SAFETY_GATE_S0) / (100 - SAFETY_GATE_S0), SAFETY_GATE_RAMP_P)
}

export interface TrailScoreV2Breakdown {
  value: number // = cts, tenuto come campo separato per compatibilità con i chiamanti esistenti
  gate: number
  vetoed: boolean
}

export interface TrailScoreV2Result {
  score: number // 0-100
  breakdown: TrailScoreV2Breakdown
}

export interface TrailScoreV2Input {
  /** Comfort TrailScore, 0-100. Richiesto: senza non è possibile calcolare il punteggio. */
  cts: number | null
  /** Punteggio Sicurezza, 0-100. Richiesto: senza non si può applicare il gate in sicurezza
   *  (un gate assente equivarrebbe ad assumere rischio nullo, cosa che non sappiamo). */
  safety: number | null
}

/**
 * Calcola il Trail Score v2 (0-100) = CTS * gate(Sicurezza). Restituisce null quando manca CTS o
 * Sicurezza — senza CTS non c'è punteggio, senza Sicurezza non si può applicare il gate in modo
 * onesto (un gate "assente" equivarrebbe ad assumere rischio zero).
 */
export function computeTrailScoreV2(input: TrailScoreV2Input): TrailScoreV2Result | null {
  const { cts, safety } = input
  if (cts == null || safety == null) return null

  const gate = safetyGate(safety)
  const score = cts * gate
  const vetoed = safety < SAFETY_VETO_THRESHOLD

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { value: cts, gate, vetoed },
  }
}
