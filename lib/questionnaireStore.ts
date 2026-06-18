export type AnchorType = 'start' | 'poi' | 'photo' | 'climb' | 'summit' | 'end'
export type QuestionInputType = 'choice' | 'text' | 'freewrite'
export type QuestionnaireStatus = 'in_progress' | 'completed' | 'skipped'

export interface QuestionnaireQuestion {
  id: string
  anchorType: AnchorType
  anchorRef?: string
  progress: number
  label: string
  question: string
  inputType: QuestionInputType
  choices?: string[]
  isFreeWrite: boolean
}

export interface QuestionnaireAnswer {
  questionId: string
  text: string
  skipped: boolean
  answeredAt: string
}

export interface Questionnaire {
  id: string
  activityId: string
  status: QuestionnaireStatus
  questions: QuestionnaireQuestion[]
  answers: Record<string, QuestionnaireAnswer>
  currentIndex: number
}

export interface QuestionnairePhotoMeta {
  caption: string
  lat?: number
  lon?: number
  progress: number
  hasExifGps?: boolean
}

export interface QuestionnaireError {
  status: number
  code: string
  message: string
}

function rowToQuestionnaire(row: Record<string, unknown>): Questionnaire {
  return {
    id:           row.id as string,
    activityId:   row.activity_id as string,
    status:       row.status as QuestionnaireStatus,
    questions:    (row.questions as QuestionnaireQuestion[]) ?? [],
    answers:      (row.answers as Record<string, QuestionnaireAnswer>) ?? {},
    currentIndex: (row.current_index as number) ?? 0,
  }
}

/** Fetches the existing questionnaire for an activity, or null if none exists yet. */
export async function getQuestionnaire(activityId: string): Promise<Questionnaire | null> {
  const res = await fetch(`/api/questionnaire?activityId=${encodeURIComponent(activityId)}`)
  if (!res.ok) throw new Error(`API /api/questionnaire → ${res.status}`)
  const row = await res.json()
  return row ? rowToQuestionnaire(row) : null
}

/** Generates (or regenerates) the questionnaire for an activity via Claude. */
export async function generateQuestionnaire(activityId: string, photos: QuestionnairePhotoMeta[]): Promise<Questionnaire> {
  const res  = await fetch('/api/questionnaire', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ activityId, photos }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err: QuestionnaireError = {
      status:  res.status,
      code:    body.error   ?? 'unknown',
      message: body.message ?? 'Errore durante la generazione del questionario.',
    }
    throw err
  }
  return rowToQuestionnaire(body)
}

/** Saves the answer to one question and advances the wizard's current index; optionally sets overall status (e.g. 'completed' on the last question). */
export async function saveAnswer(
  activityId: string,
  questionId: string,
  answer: { text: string; skipped: boolean },
  newIndex: number,
  status?: QuestionnaireStatus,
): Promise<void> {
  await fetch('/api/questionnaire', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ activityId, questionId, answer, newIndex, ...(status ? { status } : {}) }),
  })
}

/** Sets the questionnaire's overall status (e.g. 'completed' after the last question, or 'skipped' for "salta tutto"). */
export async function setQuestionnaireStatus(
  activityId: string,
  status: QuestionnaireStatus,
  newIndex?: number,
): Promise<void> {
  await fetch('/api/questionnaire', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ activityId, status, ...(newIndex !== undefined ? { newIndex } : {}) }),
  })
}
