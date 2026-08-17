// Sicurezza "per te" (app/guida) = Sicurezza Oggettiva (lib/safetyScore.ts, non sa nulla
// dell'utente) + un correttivo soggettivo delimitato (Idoneità per Te, da profilo escursionista +
// storico). Non una somma libera: il correttivo ha un tetto e un pavimento, perché il profilo
// personale non deve mai poter travestire da "sicuro" un pericolo oggettivo genuino (una valanga
// non guarda il curriculum di nessuno) — vedi FINAL_SCORE_HARD_CAP_IF_OBJECTIVE_VETOED sotto.
//
// Sulla copertina del percorso (schede chiuse in Guida) Sicurezza Oggettiva e Idoneità per te non
// si mostrano più separate: sembravano due indici che dicono la stessa cosa, a volte in apparente
// contraddizione. Lì rispondono a una sola domanda ("È sicuro per te?", combinedSafetyPhrase) e il
// "Consiglio" ne sintetizza un'altra ancora più ampia insieme al Trail Score ("Ti può piacere?" +
// "È sicuro per te?" in un'unica frase, verdictPhrase). Il dettaglio granulare (Oggettiva/Idoneità
// separate, con le rispettive spiegazioni) resta nella scheda aperta, "Dati e punteggi".
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

/** Un singolo contributo (positivo o negativo) al punteggio di idoneità, con l'etichetta da citare
 *  nelle frasi sintetiche quando è il fattore che pesa di più. */
export interface FitAdjustment { amount: number; factorLabel: string }

export interface PersonalFitResult { score: number; adjustments: FitAdjustment[] }

/**
 * Punteggio di idoneità (0-100, 50 = profilo medio/nessun dato disponibile) — quanto QUESTO
 * percorso è nelle corde di QUESTO utente, indipendentemente da quanto sia pericoloso in sé.
 * L'incidenza di vertigini/comfort-esposizione/terreno instabile e di cuore/respiro-in-quota è
 * proporzionale a quanto le rispettive categorie oggettive (Terreno, Quota) sono già severe su
 * questo specifico percorso — su un sentiero facile una paura delle vertigini non pesa nulla,
 * su una cresta esposta pesa parecchio. Registra anche i singoli contributi (adjustments) così le
 * frasi sintetiche possono citare il fattore dominante invece di un punteggio nudo e crudo.
 */
export function computePersonalFitScore(
  profile: PersonalFitProfile,
  history: PersonalFitHistory,
  route: PersonalFitRoute,
  objective: SafetyScore,
): PersonalFitResult {
  let score = 50
  const adjustments: FitAdjustment[] = []
  const push = (amount: number, factorLabel: string) => { score += amount; if (amount <= -6) adjustments.push({ amount, factorLabel }) }

  // Le etichette dei fattori includono già la preposizione articolata corretta ("al terreno",
  // "alle vertigini"...) invece che il solo sostantivo, perché le frasi sintetiche le inseriscono
  // dopo "attento" senza poter sapere se serve "a", "al", "alla" o "all'" — un singolo template
  // con "attento a {fattore}" produceva errori come "attento a il terreno".
  if (profile.experienceLevel === 'esperto') score += 10
  else if (profile.experienceLevel === 'principiante') push(-10, 'alla tua esperienza ancora limitata')

  if (profile.userAge != null && profile.userAge >= 65) push(-6, 'all\'età')

  // Scala continua sul rapporto percorso/storico, non a soglie — con soglie fisse (bonus solo se
  // lo storico superava il percorso del 10%, penalità solo se era sotto la metà) un percorso 1.05×
  // il proprio storico e uno 1.6× finivano identici (zero effetto entrambi): un percorso
  // genuinamente fuori portata restava vicino alla media invece di andare verso l'estremo basso.
  // Penalità più ampia della bonus (-25/+12): sottostimare un percorso davvero fuori portata è più
  // pericoloso che sottostimare uno alla propria portata.
  if (history.maxAltitudeM != null && history.maxAltitudeM > 0 && route.altitudeMax > 0) {
    const ratio = route.altitudeMax / history.maxAltitudeM
    push(clamp((1 - ratio) * 30, -25, 12), 'a una quota ben oltre il tuo storico')
  }
  if (history.maxDifficultyIndex != null && history.maxDifficultyIndex > 0 && route.difficultyIndex > 0) {
    const ratio = route.difficultyIndex / history.maxDifficultyIndex
    push(clamp((1 - ratio) * 30, -25, 12), 'a un dislivello ben oltre il tuo storico')
  }

  const terrainSeverity = 1 - clamp(objective.categories.terrain.score, 0, 100) / 100
  const concerns = profile.concerns
  if (concerns.includes('vertigini')) push(-14 * terrainSeverity, 'alle vertigini sui tratti esposti')
  if (concerns.includes('esposizione_a_mio_agio')) score += 14 * terrainSeverity
  if (concerns.includes('terreno_instabile')) push(-10 * terrainSeverity, 'al terreno instabile per te')

  const altitudeSeverity = 1 - clamp(objective.categories.altitude.score, 0, 100) / 100
  if (concerns.includes('cuore_pressione')) push(-10 * altitudeSeverity, 'al tuo profilo cardiovascolare in quota')
  if (concerns.includes('respiro_quota')) push(-8 * altitudeSeverity, 'alla respirazione in quota')

  if (concerns.includes('orientamento')) push(-6, 'alla tua esperienza di orientamento')

  const dependentsCount = (['bambini', 'animali', 'gravidanza'] as const).filter(c => concerns.includes(c)).length
  if (dependentsCount > 0) push(-Math.min(dependentsCount * 4, 8), 'alla presenza di chi è con te')

  return { score: clamp(Math.round(score), 0, 100), adjustments }
}

// 10 fasce in linguaggio "per te", tenute deliberatamente distinte (parole diverse, non solo
// colori) dalle 10 fasce della Sicurezza Oggettiva in lib/safetyScore.ts's objectiveSafetyLabel —
// altrimenti le due metà del badge sembrerebbero ripetere lo stesso giudizio. Usate nel dettaglio
// granulare (scheda aperta), non più sulla copertina (vedi combinedSafetyPhrase).
export function personalFitLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Nel tuo pieno controllo',  color: '#059669' }
  if (score >= 80) return { label: 'Molto comodo per te',      color: '#10b981' }
  if (score >= 70) return { label: 'Comodo per te',            color: '#22c55e' }
  if (score >= 60) return { label: 'Nelle tue corde',          color: '#84cc16' }
  if (score >= 50) return { label: 'In linea con te',          color: '#eab308' }
  if (score >= 40) return { label: 'Poco sopra la tua media',  color: '#f59e0b' }
  if (score >= 30) return { label: 'Al limite per te',         color: '#f97316' }
  if (score >= 20) return { label: 'Impegnativo per te',       color: '#ef4444' }
  if (score >= 10) return { label: 'Molto impegnativo per te', color: '#dc2626' }
  return               { label: 'Fuori portata per te',        color: '#991b1b' }
}

export interface SafetyAdvice { label: string; color: string }

// Nome "parlato" delle 5 categorie oggettive (già con preposizione articolata, vedi il commento in
// computePersonalFitScore) — usato per citare il fattore dominante quando non c'è un fattore
// personale più rilevante da nominare.
const OBJECTIVE_FACTOR_LABELS: Record<string, string> = {
  altitude: 'alla quota', terrain: 'al terreno', exposure: 'alla lunga durata',
  wildlife: 'alla fauna selvatica', logistics: 'alla logistica del percorso',
}

/** Fino a `max` fattori che pesano di più sul punteggio di idoneità — prima i contributi personali
 *  negativi (più specifici e utili all'utente), poi le categorie oggettive più severe se restano
 *  posti liberi. Deduplica testi identici (es. due concern diversi che citano "il terreno"). */
function dominantFactors(adjustments: FitAdjustment[], objective: SafetyScore, max = 2): string[] {
  const personalNeg = [...adjustments].filter(a => a.amount < 0).sort((a, b) => a.amount - b.amount).map(a => a.factorLabel)
  const cats: [string, number][] = [
    ['altitude', objective.categories.altitude.score],
    ['terrain', objective.categories.terrain.score],
    ['exposure', objective.categories.exposure.score],
    ['wildlife', objective.categories.wildlife.score],
    ['logistics', objective.categories.logistics.score],
  ]
  const worstCats = cats.filter(([, s]) => s < 60).sort((a, b) => a[1] - b[1]).map(([k]) => OBJECTIVE_FACTOR_LABELS[k])
  return Array.from(new Set([...personalNeg, ...worstCats])).slice(0, max)
}

function joinFactors(factors: string[]): string | null {
  if (factors.length === 0) return null
  if (factors.length === 1) return factors[0]
  return `${factors.slice(0, -1).join(', ')} e ${factors[factors.length - 1]}`
}

// bucket a 3 fasce (invece delle 10 fini) — le frasi sintetiche combinano due assi insieme
// (oggettivo × personale, o Trail Score × sicurezza): un incrocio a 10×10 caselle sarebbe
// ingestibile da scrivere e leggere, 3×3 resta abbastanza espressivo per una frase soltanto.
function bucket3(score: number, lowMax: number, midMax: number): 'basso' | 'medio' | 'alto' {
  if (score < lowMax) return 'basso'
  if (score < midMax) return 'medio'
  return 'alto'
}

/**
 * "È sicuro per te?" — un'unica frase per la copertina, incrocio Sicurezza Oggettiva × Idoneità
 * (non il solo punteggio finale sommato: "difficile ma nelle tue corde" e "facile ma rischioso per
 * te" sono situazioni diverse che un singolo numero fonderebbe insieme). Cita il fattore dominante
 * quando la situazione non è già interamente positiva.
 */
export function combinedSafetyPhrase(objectiveScore: number, personalFitScore: number, factor: string | null): SafetyAdvice {
  if (objectiveScore < OBJECTIVE_VETO_THRESHOLD) return { label: 'Pericoloso, sconsigliato', color: '#991b1b' }

  // objB: 'alto' = punteggio oggettivo alto = poco pericoloso (vedi objectiveSafetyLabel in
  // lib/safetyScore.ts, stessa direzione) — non "alto" come sinonimo di "molto rischioso".
  const objB = bucket3(objectiveScore, 40, 70)
  const persB = bucket3(personalFitScore, 35, 65)

  const TABLE: Record<'basso' | 'medio' | 'alto', Record<'basso' | 'medio' | 'alto', string>> = {
    alto:  { alto: 'Sicuro e nelle tue corde', medio: 'Sicuro per te', basso: 'Sicuro in sé' },
    medio: { alto: 'Qualche difficoltà, ma è nelle tue corde', medio: 'Sicuro', basso: 'Impegnativo per te' },
    basso: { alto: 'Difficile, ma alla tua portata: massima attenzione', medio: 'Rischioso: servono esperienza e cautela', basso: 'Molto rischioso per te' },
  }
  const NEEDS_FACTOR = new Set(['alto.basso', 'medio.medio', 'medio.basso'])

  let label = TABLE[objB][persB]
  if (factor && NEEDS_FACTOR.has(`${objB}.${persB}`)) label += `, attento ${factor}`

  const color =
    objB === 'basso' ? (persB === 'alto' ? '#f97316' : persB === 'medio' ? '#dc2626' : '#991b1b') :
    objB === 'medio' ? (persB === 'basso' ? '#f97316' : persB === 'medio' ? '#eab308' : '#65a30d') :
    (persB === 'basso' ? '#f59e0b' : '#22c55e')

  return { label, color }
}

export interface PersonalSafety {
  /** Sicurezza Oggettiva passata in input (già eventualmente corretta con pendenza/scala SAC da
   *  refineSafetyWithTerrainSignals) — riesposta qui solo per comodità dei chiamanti. */
  objective: SafetyScore
  personalFitScore: number
  personalFit: SafetyAdvice
  /** Punti effettivi applicati al finale (già scalati sul tetto ±MAX_PERSONAL_DELTA). */
  personalDelta: number
  finalScore: number
  /** "È sicuro per te?" — frase unica per la copertina (combinedSafetyPhrase). */
  combinedSafety: SafetyAdvice
  /** Fattore(i) citati nelle frasi sintetiche — null se il profilo è in linea, nessuno particolare
   *  da segnalare. */
  dominantFactor: string | null
}

/** Punto di ingresso unico per la UI (badge + widget "Dati e sicurezza") — combina Oggettiva e
 *  Idoneità in un pacchetto pronto da disegnare, così nessun chiamante rifà da solo l'aritmetica. */
export function computePersonalSafety(
  objective: SafetyScore,
  profile: PersonalFitProfile,
  history: PersonalFitHistory,
  route: PersonalFitRoute,
): PersonalSafety {
  const { score: personalFitScore, adjustments } = computePersonalFitScore(profile, history, route, objective)
  const personalDelta = ((personalFitScore - 50) / 50) * MAX_PERSONAL_DELTA

  let finalScore = clamp(Math.round(objective.overall + personalDelta), 0, 100)
  if (objective.overall < OBJECTIVE_VETO_THRESHOLD) {
    finalScore = Math.min(finalScore, FINAL_SCORE_HARD_CAP_IF_OBJECTIVE_VETOED)
  }

  // Due varianti di lunghezza diversa: la copertina (combinedSafety) sta su una riga sola in
  // spazio compatto, quindi cita al massimo un fattore; il Consiglio (verdictPhrase, sottotitolo a
  // piena larghezza che va normalmente a capo) può permettersi la coppia completa.
  const factors = dominantFactors(adjustments, objective)
  const dominantFactor = joinFactors(factors)

  return {
    objective,
    personalFitScore,
    personalFit: personalFitLabel(personalFitScore),
    personalDelta,
    finalScore,
    combinedSafety: combinedSafetyPhrase(objective.overall, personalFitScore, factors[0] ?? null),
    dominantFactor,
  }
}

/**
 * "Consiglio" — la sintesi più ampia di tutte: Trail Score ("ti può piacere?") incrociato con la
 * Sicurezza finale ("è sicuro per te?") in un'unica frase. Usata sia come sottotitolo della
 * copertina (sostituisce il vecchio testo scritto una tantum dall'AI, che non si aggiornava mai
 * con lo storico/i punteggi reali) sia come riga "Consiglio" nel dettaglio "Dati e punteggi".
 */
export function verdictPhrase(tsTotal: number | null, ps: PersonalSafety): SafetyAdvice {
  if (ps.objective.overall < OBJECTIVE_VETO_THRESHOLD) {
    return { label: 'Sconsigliato: pericolo oggettivo troppo alto', color: '#991b1b' }
  }

  const tsB = tsTotal == null ? 'medio' : bucket3(tsTotal, 40, 70)
  const safetyB = bucket3(ps.finalScore, 40, 70)

  const TABLE: Record<'basso' | 'medio' | 'alto', Record<'basso' | 'medio' | 'alto', string>> = {
    alto: {
      alto: 'Ti piacerà, ed è sicuro per te',
      medio: 'Ti piacerà, ma vai con attenzione',
      basso: 'Percorso splendido, ma rischioso per te: valuta bene',
    },
    medio: {
      alto: 'Percorso godibile e sicuro per te',
      medio: 'Nella media per te, con qualche attenzione alla sicurezza',
      basso: 'Non eccezionale per te, e anche rischioso: pensaci bene',
    },
    basso: {
      alto: 'Poco nelle tue corde, ma sicuro se vuoi provarlo',
      medio: 'Poco adatto a te, e serve prudenza',
      basso: 'Sconsigliato: né adatto né sicuro per te',
    },
  }

  let label = TABLE[tsB][safetyB]
  if (ps.dominantFactor && safetyB !== 'alto') label += `, attento ${ps.dominantFactor}`

  const color = safetyB === 'basso' ? '#dc2626' : safetyB === 'medio' ? '#eab308' : '#22c55e'
  return { label, color }
}
