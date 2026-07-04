'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import QuestionnaireWizard from '@/app/components/QuestionnaireWizard'
import type { RouteTimelinePhoto } from '@/app/components/RouteTimeline'
import { fetchActivityPhotos } from '@/lib/activityPhotos'
import { getActivityById, type StoredActivity } from '@/lib/blobStore'
import {
  getQuestionnaire, generateQuestionnaire, saveAnswer, setQuestionnaireStatus,
  type Questionnaire, type QuestionnairePhotoMeta, type QuestionnaireError,
} from '@/lib/questionnaireStore'
import { Loader2 } from 'lucide-react'

function toPhotoMeta(photos: RouteTimelinePhoto[]): QuestionnairePhotoMeta[] {
  return photos.map(p => ({ caption: p.caption, lat: p.lat, lon: p.lon, progress: p.progress, hasExifGps: p.hasExifGps }))
}

function errorMessage(e: unknown): string {
  const err = e as Partial<QuestionnaireError>
  return err.message ?? 'Errore durante la generazione del questionario.'
}

export default function RacconaPage() {
  const params = useParams()
  const router = useRouter()
  const id = decodeURIComponent(params.id as string)

  const [activity,      setActivity]      = useState<StoredActivity | null>(null)
  const [photos,        setPhotos]        = useState<RouteTimelinePhoto[]>([])
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)

  const loadQuestionnaire = useCallback(async (ph: RouteTimelinePhoto[]) => {
    setLoading(true)
    setError(null)
    try {
      const existing = await getQuestionnaire(id)
      const q = existing ?? await generateQuestionnaire(id, toPhotoMeta(ph))
      setQuestionnaire(q)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    getActivityById(id).then(act => {
      if (!act) { router.push('/resoconto'); return }
      setActivity(act)
    })

    fetchActivityPhotos(id)
      .then(ph => { setPhotos(ph); loadQuestionnaire(ph) })
      .catch(() => { setPhotos([]); loadQuestionnaire([]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const restart = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = await generateQuestionnaire(id, toPhotoMeta(photos))
      setQuestionnaire(q)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [id, photos])

  const handleAdvance = useCallback(async (questionId: string, text: string) => {
    if (!questionnaire) return
    const newIndex = questionnaire.currentIndex + 1
    const isLast   = newIndex >= questionnaire.questions.length
    await saveAnswer(id, questionId, { text, skipped: false }, newIndex, isLast ? 'completed' : undefined)
    setQuestionnaire(q => q ? {
      ...q,
      answers:      { ...q.answers, [questionId]: { questionId, text, skipped: false, answeredAt: new Date().toISOString() } },
      currentIndex: newIndex,
      status:       isLast ? 'completed' : q.status,
    } : q)
    if (isLast) router.push(`/resoconto/${encodeURIComponent(id)}/leggi`)
  }, [questionnaire, id, router])

  const handleSkip = useCallback(async (questionId: string) => {
    if (!questionnaire) return
    const newIndex = questionnaire.currentIndex + 1
    const isLast   = newIndex >= questionnaire.questions.length
    await saveAnswer(id, questionId, { text: '', skipped: true }, newIndex, isLast ? 'completed' : undefined)
    setQuestionnaire(q => q ? {
      ...q,
      answers:      { ...q.answers, [questionId]: { questionId, text: '', skipped: true, answeredAt: new Date().toISOString() } },
      currentIndex: newIndex,
      status:       isLast ? 'completed' : q.status,
    } : q)
    if (isLast) router.push(`/resoconto/${encodeURIComponent(id)}/leggi`)
  }, [questionnaire, id, router])

  const handleBack = useCallback(() => {
    setQuestionnaire(q => q && q.currentIndex > 0 ? { ...q, currentIndex: q.currentIndex - 1 } : q)
  }, [])

  const handleSkipAll = useCallback(async () => {
    await setQuestionnaireStatus(id, 'skipped')
    router.push(`/resoconto/${encodeURIComponent(id)}/leggi`)
  }, [id, router])

  const goToResoconto = useCallback(() => {
    router.push(`/resoconto/${encodeURIComponent(id)}/leggi`)
  }, [id, router])

  if ((loading || !activity) && !error) return (
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /><span>Sto preparando le domande…</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <BackLink className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800 text-sm transition-colors" />
          <span className="font-barlow font-bold text-stone-700 uppercase tracking-wide text-sm truncate">
            Racconta il tuo percorso
          </span>
          <span className="w-20" />
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {error && (
          <div className="max-w-md mx-auto text-center py-16">
            <p className="font-barlow font-bold uppercase tracking-wide text-red-600 mb-2">
              Non riesco a preparare le domande
            </p>
            <p className="font-lora text-sm text-stone-500 italic mb-6">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => loadQuestionnaire(photos)}
                className="px-5 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-barlow font-bold uppercase tracking-wide transition-colors">
                Riprova
              </button>
              <button onClick={goToResoconto}
                className="px-5 py-2 border border-stone-200 rounded-xl text-sm font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                Usa la generazione rapida
              </button>
            </div>
          </div>
        )}

        {!loading && !error && activity && questionnaire && (() => {
          const isFinished = questionnaire.status !== 'in_progress'
            || !questionnaire.questions[questionnaire.currentIndex]

          if (isFinished) {
            return (
              <div className="max-w-md mx-auto text-center py-16">
                <p className="font-barlow font-bold uppercase tracking-wide text-stone-700 mb-2">
                  {questionnaire.status === 'skipped' ? 'Questionario saltato' : 'Questionario completato'}
                </p>
                <p className="font-lora text-sm text-stone-500 italic mb-6">
                  {questionnaire.status === 'skipped'
                    ? 'Puoi generare il resoconto rapido, oppure ricominciare il racconto guidato.'
                    : 'Le tue risposte sono pronte per essere fuse nel resoconto. Torna alla pagina del resoconto per generarlo.'}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button onClick={goToResoconto}
                    className="px-5 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-xl text-sm font-barlow font-bold uppercase tracking-wide transition-colors">
                    Torna al resoconto
                  </button>
                  <button onClick={restart}
                    className="px-5 py-2 border border-stone-200 rounded-xl text-sm font-barlow font-bold uppercase tracking-wide text-stone-600 hover:bg-stone-50 transition-colors">
                    Ricomincia
                  </button>
                </div>
              </div>
            )
          }

          return (
            <QuestionnaireWizard
              questions={questionnaire.questions}
              answers={questionnaire.answers}
              currentIndex={questionnaire.currentIndex}
              trackPoints={activity.trackPoints}
              photos={photos}
              onAdvance={handleAdvance}
              onSkip={handleSkip}
              onBack={handleBack}
              onSkipAll={handleSkipAll}
            />
          )
        })()}
      </main>
    </div>
  )
}
