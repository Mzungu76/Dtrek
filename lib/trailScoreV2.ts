// Trail Score v2 — combina Comfort TrailScore e Ombra&Acqua in un "Value" (Livello 1, pesi
// dinamici in base alla temperatura prevista se nota — vedi trailscorev2spec.md per la
// derivazione completa), poi applica alla Sicurezza un gate sigmoide non-compensabile
// (Livello 2): un percorso rischioso non può essere "salvato" da quanto è bello o comodo.
//
// L'Affidabilità (CL) NON entra in questa formula. In origine era un terzo livello — uno
// shrinkage bayesiano verso un prior neutro, "quanto fidarsi del punteggio appena calcolato" —
// ma penalizzava percorsi genuinamente belli e sicuri solo perché situati in zone con poca
// densità di dati indipendenti (poca copertura OSM/community, poche osservazioni naturalistiche
// nei dintorni — gran parte dell'Appennino/aree rurali italiane), non per un problema reale sul
// sentiero. Resta visibile come badge indipendente (vedi components/ScoreRing.tsx: "quanto ci
// fidiamo di questi dati", non "quanto è bello/sicuro il percorso"), fuori dal calcolo del
// punteggio.
//
// Scala di output: 0-100.

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
// Sopra S0 il vecchio gate (lo stesso sigmoide, semplicemente proseguito) saturava quasi subito
// verso 1.0 — già 0.92 a Sicurezza 60, 0.99 a 80: la stragrande maggioranza dei percorsi
// pianificati normalmente, che NON sono pericolosi, finiva con un gate pressoché costante, senza
// alcuna differenziazione reale tra "abbastanza sicuro" e "molto sicuro". Sopra la soglia il gate
// ora sale con una curva più dolce (esponente <1, forte recupero appena sopra S0 così un percorso
// "Moderato" non crolla, ma continua comunque a differenziare fino a "Sicuro") invece di saturare.
export const SAFETY_GATE_RAMP_P = 0.7

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

/** Gate della Sicurezza (Livello 2) — 1 = nessun effetto, 0 = azzera il Value. Sotto S0 resta il
 *  sigmoide ripido di sempre (il "veto" su un percorso davvero pericoloso non cambia); sopra S0
 *  sale con una curva più dolce fino a 1.0 — vedi il commento su SAFETY_GATE_RAMP_P sul perché. */
export function safetyGate(safety: number): number {
  if (safety <= SAFETY_GATE_S0) {
    return 1 / (1 + Math.exp(-SAFETY_GATE_K * (safety - SAFETY_GATE_S0)))
  }
  return 0.5 + 0.5 * Math.pow((safety - SAFETY_GATE_S0) / (100 - SAFETY_GATE_S0), SAFETY_GATE_RAMP_P)
}

export interface TrailScoreV2Breakdown {
  wCts: number
  wOa: number
  value: number
  gate: number
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
  /** Temperatura prevista (°C) nel giorno dell'escursione, se disponibile — vedi
   *  app/guida/useForecastTemp.ts. Assente ⇒ pesi statici (nessuna ponderazione stagionale). */
  forecastTempC?: number | null
}

/**
 * Calcola il Trail Score v2 (0-100). Restituisce null quando manca CTS o Sicurezza — senza CTS
 * non c'è Value, senza Sicurezza non si può applicare il gate in modo onesto (un gate "assente"
 * equivarrebbe ad assumere rischio zero). Ombra&Acqua invece è genuinamente sostituibile con CTS
 * (Livello 1), quindi la sua assenza degrada correttamente a w_oa=0 invece di bloccare il calcolo.
 */
export function computeTrailScoreV2(input: TrailScoreV2Input): TrailScoreV2Result | null {
  const { cts, ombraAcqua, safety, forecastTempC } = input
  if (cts == null || safety == null) return null

  const { wCts, wOa } = ombraAcqua == null
    ? { wCts: 1, wOa: 0 }
    : seasonalWeights(forecastTempC)

  const value = wCts * cts + wOa * (ombraAcqua ?? 0)
  const gate = safetyGate(safety)
  const score = value * gate
  const vetoed = safety < SAFETY_VETO_THRESHOLD

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: { wCts, wOa, value, gate, vetoed },
  }
}
