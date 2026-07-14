import { lsGet, lsSet, LS_KEYS, obEnqueue } from './localStore'
import { registerEntityFlusher, scheduleFlush, flushRows } from './sync/syncEngine'

const ENTITY_TYPE = 'hike_questionnaire'

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

/** Returns the local copy if present; only hits Supabase when there's no local copy yet. */
export async function getQuestionnaire(activityId: string): Promise<Questionnaire | null> {
  const local = await lsGet<Questionnaire>(LS_KEYS.questionnaire(activityId))
  if (local) return local
  const res = await fetch(`/api/questionnaire?activityId=${encodeURIComponent(activityId)}`)
  if (!res.ok) throw new Error(`API /api/questionnaire → ${res.status}`)
  const row = await res.json()
  const q = row ? rowToQuestionnaire(row) : null
  if (q) await lsSet(LS_KEYS.questionnaire(activityId), q)
  return q
}

/** Generates (or regenerates) the questionnaire for an activity via Claude — always network-direct, no offline equivalent. Caches the result so the wizard's subsequent reads are cache-first. */
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
  const q = rowToQuestionnaire(body)
  await lsSet(LS_KEYS.questionnaire(activityId), q)
  return q
}

/**
 * Applies the answer to the local cache immediately and queues it for
 * background sync — never blocks on the network (the wizard already keeps
 * its own optimistic state, see app/resoconto/[id]/racconta/page.tsx).
 * Each question gets its own outbox row (recordId = activityId:questionId)
 * so answering several questions offline queues independently instead of
 * one overwriting another.
 */
export async function saveAnswer(
  activityId: string,
  questionId: string,
  answer: { text: string; skipped: boolean },
  newIndex: number,
  status?: QuestionnaireStatus,
): Promise<void> {
  const local = await lsGet<Questionnaire>(LS_KEYS.questionnaire(activityId))
  if (local) {
    await lsSet(LS_KEYS.questionnaire(activityId), {
      ...local,
      answers: {
        ...local.answers,
        [questionId]: { questionId, text: answer.text, skipped: answer.skipped, answeredAt: new Date().toISOString() },
      },
      currentIndex: newIndex,
      status: status ?? local.status,
    })
  }
  await obEnqueue(ENTITY_TYPE, `${activityId}:${questionId}`, 'patch', { activityId, questionId, answer, newIndex, status })
  scheduleFlush()
}

/** Sets the questionnaire's overall status (e.g. 'completed' after the last question, or 'skipped' for "salta tutto"). */
export async function setQuestionnaireStatus(
  activityId: string,
  status: QuestionnaireStatus,
  newIndex?: number,
): Promise<void> {
  const local = await lsGet<Questionnaire>(LS_KEYS.questionnaire(activityId))
  if (local) {
    await lsSet(LS_KEYS.questionnaire(activityId), {
      ...local,
      status,
      ...(newIndex !== undefined ? { currentIndex: newIndex } : {}),
    })
  }
  await obEnqueue(ENTITY_TYPE, `${activityId}:__status`, 'patch', { activityId, status, ...(newIndex !== undefined ? { newIndex } : {}) })
  scheduleFlush()
}

registerEntityFlusher(ENTITY_TYPE, (rows) => flushRows(rows, async (row) => {
  const res = await fetch('/api/questionnaire', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(row.payload),
  })
  if (!res.ok) throw new Error(`${res.status}`)
}))
