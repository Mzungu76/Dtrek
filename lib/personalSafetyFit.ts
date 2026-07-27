// Sicurezza "per te" (app/guida) = Sicurezza Oggettiva (lib/safetyScore.ts, non sa nulla
// dell'utente) + un correttivo soggettivo delimitato (Idoneità per Te, da profilo escursionista +
// storico). Non una somma libera: il correttivo ha un tetto e un pavimento, perché il profilo
// personale non deve mai poter travestire da "sicuro" un pericolo oggettivo genuino (una valanga
// non guarda il curriculum di nessuno) — vedi FINAL_SCORE_HARD_CAP_IF_OBJECTIVE_VETOED sotto.
import type { SafetyScore } from './safetyScore'
import type { HikerExperienceLevel, HikerConcernKey } from './hikerProfile'

export interface PersonalFitProfile {
  experienceLevel: HikerExperienceLevel | null
  concerns: HikerConcernKey[]
  userAge?: number
}

export interface PersonalFitHistory {
  /** Quota massima mai raggiunta in un'escursione completata (record personale già calcolato per i
   *  badge, vedi lib/stats.ts's getPersonalRecords — nessun nuovo dato da tracciare). */
  maxAltitudeM?: number
  /** Indice di difficoltà massimo mai affrontato (dislivello/km, stessa formula di lib/stats.ts's
   *  difficultyIndex, applicata al record personale "highestDifficulty"). */
  maxDifficultyIndex?: number
}

export interface PersonalFitRoute {
  altitudeMax: number
  difficultyIndex: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Tetto al correttivo soggettivo — il profilo personale può spostare il punteggio finale di al
// massimo questi punti in ciascuna direzione.
export const MAX_PERSONAL_DELTA = 20
// Stessa soglia di SAFETY_VETO_THRESHOLD in lib/trailScoreV2.ts — sotto questo valore oggettivo il
// finale resta bloccato in banda rossa qualunque sia il profilo.
const OBJECTIVE_VETO_THRESHOLD = 15
export const FINAL_SCORE_HARD_CAP_IF_OBJECTIVE_VETOED = 35

/**
 * Punteggio di idoneità (0-100, 50 = profilo medio/nessun dato disponibile) — quanto QUESTO
 * percorso è nelle corde di QUESTO utente, indipendentemente da quanto sia pericoloso in sé.
 * L'incidenza di vertigini/comfort-esposizione/terreno instabile e di cuore/respiro-in-quota è
 * proporzionale a quanto le rispettive categorie oggettive (Terreno, Quota) sono già severe su
 * questo specifico percorso — su un sentiero facile una paura delle vertigini non pesa nulla,
 * su una cresta esposta pesa parecchio.
 */
export function computePersonalFitScore(
  profile: PersonalFitProfile,
  history: PersonalFitHistory,
  route: PersonalFitRoute,
  objective: SafetyScore,
): number {
  let score = 50

  if (profile.experienceLevel === 'esperto') score += 10
  else if (profile.experienceLevel === 'principiante') score -= 10

  if (profile.userAge != null && profile.userAge >= 65) score -= 6

  // Scala continua sul rapporto percorso/storico, non a soglie — con le soglie precedenti
  // (bonus solo se lo storico supera il percorso del 10%, penalità solo se lo storico è meno
  // della metà) un percorso 1.05× il proprio storico e uno 1.6× il proprio storico finivano
  // identici (zero effetto entrambi): un percorso genuinamente fuori portata (es. il doppio del
  // dislivello mai affrontato) restava vicino alla media invece di andare verso l'estremo basso.
  // Penalità più ampia della bonus (-25/+12): sottostimare un percorso davvero fuori portata è più
  // pericoloso che sottostimare uno alla propria portata.
  if (history.maxAltitudeM != null && history.maxAltitudeM > 0 && route.altitudeMax > 0) {
    const ratio = route.altitudeMax / history.maxAltitudeM
    score += clamp((1 - ratio) * 30, -25, 12)
  }
  if (history.maxDifficultyIndex != null && history.maxDifficultyIndex > 0 && route.difficultyIndex > 0) {
    const ratio = route.difficultyIndex / history.maxDifficultyIndex
    score += clamp((1 - ratio) * 30, -25, 12)
  }

  const terrainSeverity = 1 - clamp(objective.categories.terrain.score, 0, 100) / 100
  const concerns = profile.concerns
  if (concerns.includes('vertigini')) score -= 14 * terrainSeverity
  if (concerns.includes('esposizione_a_mio_agio')) score += 14 * terrainSeverity
  if (concerns.includes('terreno_instabile')) score -= 10 * terrainSeverity

  const altitudeSeverity = 1 - clamp(objective.categories.altitude.score, 0, 100) / 100
  if (concerns.includes('cuore_pressione')) score -= 10 * altitudeSeverity
  if (concerns.includes('respiro_quota')) score -= 8 * altitudeSeverity

  if (concerns.includes('orientamento')) score -= 6

  const dependentsCount = (['bambini', 'animali', 'gravidanza'] as const).filter(c => concerns.includes(c)).length
  score -= Math.min(dependentsCount * 4, 8)

  return clamp(Math.round(score), 0, 100)
}

// 10 fasce in linguaggio "per te", tenute deliberatamente distinte (parole diverse, non solo
// colori) dalle 10 fasce della Sicurezza Oggettiva in lib/safetyScore.ts's objectiveSafetyLabel —
// altrimenti le due metà del badge sembrerebbero ripetere lo stesso giudizio.
export function personalFitLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Nel tuo pieno controllo',        color: '#059669' }
  if (score >= 80) return { label: 'Molto comodo per te',            color: '#10b981' }
  if (score >= 70) return { label: 'Comodo per te',                  color: '#22c55e' }
  if (score >= 60) return { label: 'Nelle tue corde',                color: '#84cc16' }
  if (score >= 50) return { label: 'In linea con te',                color: '#eab308' }
  if (score >= 40) return { label: 'Poco sopra la tua media', color: '#f59e0b' }
  if (score >= 30) return { label: 'Al limite per te',        color: '#f97316' }
  if (score >= 20) return { label: 'Impegnativo per te',             color: '#ef4444' }
  if (score >= 10) return { label: 'Molto impegnativo per te',       color: '#dc2626' }
  return               { label: 'Fuori portata per te',              color: '#991b1b' }
}

export interface SafetyAdvice { label: string; color: string }

/** Etichetta del punteggio finale: un consiglio operativo sul rischio, non un giudizio sul
 *  percorso in generale — "ideale/adatto a te" sconfinerebbe nella bellezza/adeguatezza fisica,
 *  già di competenza del Trail Score. Qui si resta sul solo perimetro della sicurezza (si può
 *  andare, con quali cautele), vedi il tetto assoluto quando l'oggettivo è sotto soglia veto. */
export function safetyAdviceLabel(finalScore: number, objectiveScore: number): SafetyAdvice {
  if (objectiveScore < OBJECTIVE_VETO_THRESHOLD) return { label: 'Sconsigliato', color: '#991b1b' }
  if (finalScore < 20) return { label: 'Sconsigliato',            color: '#dc2626' }
  if (finalScore < 40) return { label: 'Solo con guida esperta',  color: '#f97316' }
  if (finalScore < 60) return { label: 'Fattibile con cautela',   color: '#eab308' }
  if (finalScore < 80) return { label: 'Via libera con attenzione', color: '#22c55e' }
  return                     { label: 'Via libera in sicurezza',   color: '#059669' }
}

export interface PersonalSafety {
  /** Sicurezza Oggettiva passata in input (già eventualmente corretta con la pendenza da
   *  refineSafetyWithSlope) — riesposta qui solo per comodità dei chiamanti. */
  objective: SafetyScore
  personalFitScore: number
  personalFit: SafetyAdvice
  /** Punti effettivi applicati al finale (già scalati sul tetto ±MAX_PERSONAL_DELTA). */
  personalDelta: number
  finalScore: number
  advice: SafetyAdvice
}

/** Punto di ingresso unico per la UI (badge + widget "Dati e sicurezza") — combina Oggettiva e
 *  Idoneità in un pacchetto pronto da disegnare, così nessun chiamante rifà da solo l'aritmetica. */
export function computePersonalSafety(
  objective: SafetyScore,
  profile: PersonalFitProfile,
  history: PersonalFitHistory,
  route: PersonalFitRoute,
): PersonalSafety {
  const personalFitScore = computePersonalFitScore(profile, history, route, objective)
  const personalDelta = ((personalFitScore - 50) / 50) * MAX_PERSONAL_DELTA

  let finalScore = clamp(Math.round(objective.overall + personalDelta), 0, 100)
  if (objective.overall < OBJECTIVE_VETO_THRESHOLD) {
    finalScore = Math.min(finalScore, FINAL_SCORE_HARD_CAP_IF_OBJECTIVE_VETOED)
  }

  return {
    objective,
    personalFitScore,
    personalFit: personalFitLabel(personalFitScore),
    personalDelta,
    finalScore,
    advice: safetyAdviceLabel(finalScore, objective.overall),
  }
}
