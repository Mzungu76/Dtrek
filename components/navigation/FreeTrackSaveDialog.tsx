'use client'
import { useEffect, useState } from 'react'
import { BookOpen, CheckCircle2, Loader2 } from 'lucide-react'
import type { TcxActivity } from '@/lib/tcxParser'
import { listSelectableDiaries, type DiaryChoice } from '@/lib/diari/syntheticPercorso'

interface Props {
  activity: TcxActivity
  defaultTitle: string
  /** diaryId è il Diario scelto qui sotto, per la Meta sintetica creata per questa traccia
   *  (nessun percorso pianificato esiste già, a differenza di EndHikeReviewDialog). */
  onSave: (title: string, diaryId: string | undefined) => Promise<void>
  onDiscard: () => void
}

function formatKm(m: number): string {
  return (m / 1000).toFixed(1)
}
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

/**
 * Save/discard review for a track recorded with no planned route behind it
 * (FreeTrackSession, app/navigatore/traccia). A separate, simpler component
 * from EndHikeReviewDialog rather than a reused/branched one: that dialog's
 * two save buttons ("sovrascrivi il percorso pianificato" / "salva come
 * nuovo") only make sense when a planned hike is linked, which a freeform
 * recording never has — forcing that choice here would just be confusing
 * copy about a plan that doesn't exist.
 */
export default function FreeTrackSaveDialog({ activity, defaultTitle, onSave, onDiscard }: Props) {
  const [title, setTitle] = useState(defaultTitle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diaryChoices, setDiaryChoices] = useState<DiaryChoice[]>([])
  const [selectedDiaryId, setSelectedDiaryId] = useState<string | null>(null)

  useEffect(() => {
    listSelectableDiaries().then(choices => {
      setDiaryChoices(choices)
      setSelectedDiaryId(prev => prev ?? (choices.find(d => d.isDefault) ?? choices[0])?.id ?? null)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(title, selectedDiaryId ?? undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#fdfcfa] shadow-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-6 h-6 text-forest-500" />
          <h2 className="text-lg font-bold font-display text-stone-900">Traccia registrata</h2>
        </div>

        <div className="grid grid-cols-2 gap-y-3 mb-4 p-4 rounded-xl bg-forest-50 border border-forest-200">
          <div>
            <div className="text-xl font-bold font-mono text-stone-900">{formatKm(activity.distanceMeters)} km</div>
            <div className="text-xs text-stone-500 font-body">Distanza</div>
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-stone-900">{formatDuration(activity.totalTimeSeconds)}</div>
            <div className="text-xs text-stone-500 font-body">Durata</div>
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-stone-900">+{Math.round(activity.elevationGain)} m</div>
            <div className="text-xs text-stone-500 font-body">Dislivello</div>
          </div>
          <div>
            <div className="text-xl font-bold font-mono text-stone-900">{(activity.avgSpeedMs * 3.6).toFixed(1)} km/h</div>
            <div className="text-xs text-stone-500 font-body">Velocità media</div>
          </div>
        </div>

        <label className="block text-xs font-semibold text-stone-500 font-body uppercase tracking-wide mb-1.5">Titolo</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-stone-900 font-body mb-5 focus:outline-none focus:ring-2 focus:ring-forest-400"
          placeholder="Nome della traccia"
        />

        {diaryChoices.length > 0 && (
          <div className="mb-5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 font-body uppercase tracking-wide mb-1.5">
              <BookOpen className="w-3.5 h-3.5 text-forest-500" /> In quale Diario?
            </label>
            <div className="flex flex-wrap gap-2">
              {diaryChoices.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDiaryId(d.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                    ${selectedDiaryId === d.id
                      ? 'bg-forest-500 text-white border-forest-500'
                      : 'bg-white text-stone-600 border-stone-200 hover:border-forest-300'}`}
                >
                  {d.title}{d.isDefault ? ' (predefinito)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 font-body mb-3">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-forest-500 text-white font-semibold font-body text-sm hover:bg-forest-600 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Salvataggio…' : 'Salva nel Diario'}
          </button>
          <button
            onClick={onDiscard}
            disabled={saving}
            className="w-full py-2 text-stone-500 font-semibold font-body text-sm hover:text-stone-700 disabled:opacity-50"
          >
            Scarta
          </button>
        </div>
      </div>
    </div>
  )
}
