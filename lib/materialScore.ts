export interface MaterialScoreInput {
  photoCount: number
  positionedPhotoCount: number
  questionnaireStatus: 'none' | 'in_progress' | 'completed' | 'skipped'
  questionnaireAnswered: number
  questionnaireTotal: number
  hasUserNotes: boolean
  hasWeather: boolean
  hasGuideOrPoi: boolean
}

export interface MaterialScoreResult {
  score: number
  label: 'scarso' | 'buono' | 'ottimo'
  suggestion: string | null
}

/** Quanto materiale reale c'è per scrivere un resoconto ricco — non un voto di merito, solo un
 *  segnale per capire cosa aggiungere prima di generare. Pesi additivi (max 100), stesso stile
 *  già usato per punteggi composti nel repo (vedi lib/trailScore.ts). */
export function computeMaterialScore(input: MaterialScoreInput): MaterialScoreResult {
  const photoScore = Math.min(35, input.photoCount * 6)
    + (input.photoCount > 0 && input.positionedPhotoCount / input.photoCount >= 0.5 ? 5 : 0)
  const cappedPhotoScore = Math.min(35, photoScore)

  const questionnaireScore = input.questionnaireTotal > 0
    ? Math.round(35 * (input.questionnaireAnswered / input.questionnaireTotal))
    : 0

  const notesScore   = input.hasUserNotes  ? 10 : 0
  const weatherScore = input.hasWeather    ? 10 : 0
  const guideScore   = input.hasGuideOrPoi ? 10 : 0

  const score = Math.min(100, cappedPhotoScore + questionnaireScore + notesScore + weatherScore + guideScore)

  const label: MaterialScoreResult['label'] = score < 40 ? 'scarso' : score < 70 ? 'buono' : 'ottimo'

  let suggestion: string | null = null
  if (score < 70) {
    // Suggerisce il componente più debole tra i due su cui l'utente ha controllo diretto e peso
    // maggiore (foto e questionario) — mai le note/meteo/guida, che non sono "azionabili" allo stesso modo.
    if (cappedPhotoScore <= questionnaireScore) {
      suggestion = 'Aggiungi qualche foto, magari in vetta o nei punti più belli, per un resoconto più ricco.'
    } else if (input.questionnaireStatus !== 'completed' && input.questionnaireStatus !== 'skipped') {
      suggestion = 'Rispondi a qualche domanda del racconto guidato per renderlo più personale.'
    }
  }

  return { score, label, suggestion }
}
