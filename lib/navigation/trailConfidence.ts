// Fase 8 di docs/navigator-orizzonti-roadmap.md — Trail Confidence: non un singolo numero
// calcolato allo stesso modo di Trail Score, ma uno stato dinamico di affidabilità che
// combina segnali di natura diversa. Funzione pura, nessuna chiamata di rete qui — il
// chiamante passa i segnali già calcolati altrove (pianificazione, Condizioni attuali, Fase 4).
//
// Scope di questa v1 (esplicitamente più leggero della definizione a 7 segnali della roadmap):
// combina Trail Score (pianificazione) e il segnale meteo/clima già calcolato da
// lib/trailConditions/ — qualità geometrica del tracciato, coerenza GPS osservata dal vivo e
// qualità/copertura della rete durante la navigazione NON sono ancora inclusi, perché
// richiederebbero nuova strumentazione live non ancora costruita (vedi "Non ancora fatto" nella
// roadmap). Il segnale community (Fase 4) è già incluso, ma sempre come piccolo correttivo, mai
// come componente pesato alla pari — coerente col principio "attenuato, non sommato alla pari"
// della roadmap.
import type { CommunitySignal } from '@/lib/trailConditions/types'
import { safetyGate } from '@/lib/trailScoreV2'

export interface TrailConfidenceInput {
  /** DTREK-AUDIT.md P1 #17 — il Comfort TrailScore PERSONALE (fatica/bellezza per QUESTO
   *  escursionista, 0-100 tipicamente, lib/trailScoreV2.ts's `cts`) — non più il TrailScoreV2 già
   *  gated dalla Sicurezza (`cachedTsTotal`). Prima di questo fix i due segnali erano confusi in
   *  un unico numero: un percorso sicuro ma faticoso/poco adatto al profilo dell'utente produceva
   *  lo stesso punteggio basso di un percorso davvero pericoloso, con la stessa etichetta
   *  d'allarme — vedi `safetyScore` sotto, ora il canale separato per il giudizio di sicurezza. */
  trailScore?: number | null
  /** DTREK-AUDIT.md P1 #17 — Punteggio Sicurezza calcolato in pianificazione (0-100,
   *  lib/safetyScore.ts's `overall`), applicato come gate SEPARATO — stesso principio
   *  non-compensabile di `lib/trailScoreV2.ts`'s `safetyGate` (un percorso rischioso non può
   *  essere "salvato" da quanto ti si addice), ma qui il motivo viene riportato in `factors` con
   *  un testo esplicitamente distinto da quello sul Trail Score personale, così un'etichetta
   *  bassa causata da scarsa sicurezza non si legge come "non ti si addice" e viceversa. */
  safetyScore?: number | null
  /** WeatherSignal.totalPenalty da lib/trailConditions/weatherSignals.ts (tipicamente -35..0, 0 = nessuna penalità). */
  weatherPenalty?: number | null
  /** ClimateSignal — somma di tempPenalty/altitudeSeason/seasonBonus da lib/trailConditions/climateSignals.ts. */
  climatePenalty?: number | null
  /** Segnale community già attenuato (Fase 4, confidenceWeight 0..0.5) — mai un componente pesato alla pari, solo un piccolo correttivo positivo. */
  community?: CommunitySignal | null
}

export interface TrailConfidenceResult {
  score: number // 0..1
  /** 'sconosciuta' è un'etichetta distinta da 'bassa' — non significa "rischioso", significa "non
   * abbiamo alcun segnale di base (Trail Score/meteo/clima) su cui fondare un giudizio", anche se
   * lo score numerico (0.5, neutro) può in teoria ricadere nella fascia 'media'. Confondere le due
   * cose è esattamente il bias "assenza di dato trattata come dato neutro" da evitare qui. */
  label: 'alta' | 'media' | 'bassa' | 'sconosciuta'
  /** Sempre popolato — stesso principio "l'utente deve sempre sapere perché" già usato nell'Escape Engine (spec §11). */
  factors: string[]
}

// Il correttivo community non supera mai questo valore, anche al massimo confidenceWeight
// (0.5, Fase 4) — un segnale rumoroso e volatile non deve mai spostare il punteggio quanto
// Trail Score o le condizioni meteo/clima.
const MAX_COMMUNITY_BONUS = 0.1
const WEATHER_PENALTY_FLOOR = -60 // oltre questa somma (weather+climate), il punteggio normalizzato satura a 0

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function labelFor(score: number): TrailConfidenceResult['label'] {
  if (score >= 0.7) return 'alta'
  if (score >= 0.4) return 'media'
  return 'bassa'
}

export function computeTrailConfidence(input: TrailConfidenceInput): TrailConfidenceResult {
  const factors: string[] = []
  const components: { value: number; weight: number }[] = []

  if (input.trailScore != null && Number.isFinite(input.trailScore)) {
    const norm = clamp01(input.trailScore / 100)
    components.push({ value: norm, weight: 0.6 })
    // DTREK-AUDIT.md P1 #17 — testo esplicitamente sul "quanto ti si addice" (fatica/bellezza
    // personale), mai su "sicuro"/"pericoloso": quel giudizio ha ora il proprio fattore separato
    // sotto, guidato da safetyScore, non da questo componente.
    factors.push(
      norm >= 0.7 ? 'Il percorso ti si addice bene, secondo il tuo profilo escursionistico' :
      norm >= 0.4 ? 'Il percorso ti si addice nella media, secondo il tuo profilo escursionistico' :
      'Il percorso potrebbe risultarti più faticoso o meno adatto del previsto (non è un giudizio di sicurezza)',
    )
  }

  const totalWeatherClimatePenalty = (input.weatherPenalty ?? 0) + (input.climatePenalty ?? 0)
  if (input.weatherPenalty != null || input.climatePenalty != null) {
    const norm = clamp01(1 + totalWeatherClimatePenalty / -WEATHER_PENALTY_FLOOR)
    components.push({ value: norm, weight: 0.4 })
    if (totalWeatherClimatePenalty <= -15) factors.push('Condizioni meteo/clima recenti penalizzanti')
    else if (totalWeatherClimatePenalty >= 0) factors.push('Condizioni meteo/clima favorevoli')
  }

  const hasBaseSignal = components.length > 0

  let base: number
  if (!hasBaseSignal) {
    base = 0.5
    factors.push('Dati insufficienti per una stima affidabile')
  } else {
    const totalWeight = components.reduce((s, c) => s + c.weight, 0)
    base = components.reduce((s, c) => s + c.value * c.weight, 0) / totalWeight
  }

  let communityBonus = 0
  if (input.community && input.community.confidenceWeight > 0) {
    communityBonus = input.community.confidenceWeight * (MAX_COMMUNITY_BONUS / 0.5)
    factors.push(
      input.community.completions30d >= 3
        ? 'Confermato da più escursionisti negli ultimi 30 giorni'
        : 'Confermato da almeno un escursionista di recente',
    )
  }

  const preGateScore = clamp01(base + communityBonus)

  // DTREK-AUDIT.md P1 #17 — gate SEPARATO sulla Sicurezza, stesso principio non-compensabile di
  // lib/trailScoreV2.ts's safetyGate (un percorso rischioso non può essere "salvato" da quanto ti
  // si addice) ma riportato con un fattore testuale distinto, mai mescolato nella stessa frase del
  // Trail Score personale — così un'etichetta bassa causata da scarsa sicurezza non si legge come
  // "non ti si addice" (fattore sopra) e viceversa.
  let score = preGateScore
  if (input.safetyScore != null && Number.isFinite(input.safetyScore)) {
    const gate = safetyGate(input.safetyScore)
    score = clamp01(preGateScore * gate)
    if (gate < 0.5) factors.push('Punteggio di Sicurezza basso in fase di pianificazione — non un giudizio di comodità')
    else if (gate < 0.9) factors.push('Punteggio di Sicurezza moderato in fase di pianificazione — non un giudizio di comodità')
  }

  // Senza Trail Score/meteo/clima, il correttivo community (max +0.1, mai un componente alla
  // pari) non basta a trasformare "non lo sappiamo" in un giudizio "medio" genuino — l'etichetta
  // resta 'sconosciuta' anche se lo score numerico ricadrebbe in fascia 'media'.
  const label = hasBaseSignal ? labelFor(score) : 'sconosciuta'
  return { score, label, factors }
}
