'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, SkipForward } from 'lucide-react'
import RouteTimeline, { type RouteTimelinePhoto } from '@/app/components/RouteTimeline'
import type { TrackPoint } from '@/lib/tcxParser'
import type { QuestionnaireQuestion, QuestionnaireAnswer } from '@/lib/questionnaireStore'

export default function QuestionnaireWizard({
  questions,
  answers,
  currentIndex,
  trackPoints,
  photos,
  onAdvance,
  onSkip,
  onBack,
  onSkipAll,
}: {
  questions: QuestionnaireQuestion[]
  answers: Record<string, QuestionnaireAnswer>
  currentIndex: number
  trackPoints: TrackPoint[]
  photos: RouteTimelinePhoto[]
  onAdvance: (questionId: string, text: string) => void
  onSkip: (questionId: string) => void
  onBack: () => void
  onSkipAll: () => void
}) {
  const question = questions[currentIndex]
  const existing = question ? answers[question.id] : undefined

  const [value, setValue] = useState(existing?.text ?? '')

  useEffect(() => {
    setValue(existing?.text ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id])

  if (!question) return null

  const photoAnchor = question.anchorType === 'photo' && question.anchorRef !== undefined
    ? photos[Number(question.anchorRef)]
    : undefined

  const isLast     = currentIndex === questions.length - 1
  const isChoice   = question.inputType === 'choice'
  const canAdvance = value.trim().length > 0

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-center font-barlow text-xs font-bold uppercase tracking-wide text-stone-400 mb-4">
        Domanda {currentIndex + 1} di {questions.length}
      </p>

      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 mb-5">
        <RouteTimeline trackPoints={trackPoints} photos={photos} highlightProgress={question.progress} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-5">
        <span className="inline-block text-[11px] font-barlow font-bold uppercase tracking-wide text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full mb-3">
          {question.label} · {Math.round(question.progress * 100)}% del percorso
        </span>

        {photoAnchor && (
          <img src={photoAnchor.dataUrl} alt={photoAnchor.caption}
            className="w-full max-h-56 object-cover rounded-xl shadow mb-4" />
        )}

        <p className="font-lora text-lg text-stone-800 leading-relaxed mb-4">{question.question}</p>

        {question.isFreeWrite && (
          <p className="text-xs text-stone-400 font-lora italic mb-3">
            Scrivi con le tue parole: il senso di quello che racconti verrà ripreso nella narrazione finale, non riportato alla lettera.
          </p>
        )}

        {isChoice ? (
          <div className="flex flex-wrap gap-2">
            {question.choices?.map(c => (
              <button key={c} onClick={() => setValue(c)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  value === c
                    ? 'bg-forest-600 text-white border-forest-600'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}>
                {c}
              </button>
            ))}
          </div>
        ) : (
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={question.inputType === 'freewrite' ? 6 : 3}
            placeholder="Scrivi qui…"
            className="w-full bg-stone-50 border border-stone-200 rounded-xl p-4 font-lora text-sm text-stone-700 leading-relaxed outline-none focus:border-forest-400 resize-y"
          />
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={onBack} disabled={currentIndex === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 text-sm font-barlow font-bold uppercase tracking-wide text-stone-500 disabled:opacity-30 hover:bg-stone-50 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Indietro
        </button>

        <button onClick={onSkipAll}
          className="text-xs font-lora italic text-stone-400 hover:text-stone-600 transition-colors">
          Salta tutto e genera ora
        </button>

        <div className="flex items-center gap-2">
          <button onClick={() => onSkip(question.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-barlow font-bold uppercase tracking-wide text-stone-500 hover:bg-stone-50 transition-colors">
            <SkipForward className="w-4 h-4" /> Salta
          </button>
          <button onClick={() => onAdvance(question.id, value)} disabled={!canAdvance}
            className="flex items-center gap-1.5 px-5 py-2 bg-forest-600 hover:bg-forest-700 disabled:opacity-40 text-white rounded-xl text-sm font-barlow font-bold uppercase tracking-wide transition-colors">
            {isLast ? 'Termina' : 'Avanti'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
