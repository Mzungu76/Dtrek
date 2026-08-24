'use client'
import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { TcxActivity } from '@/lib/tcxParser'
import { MAX_NOTE_LENGTH } from '@/lib/community/moderation'

interface Props {
  activity: TcxActivity
  defaultTitle: string
  /** Il percorso pianificato collegato non viene mai cancellato dal salvataggio — resta
   * un'ancora ripetibile a cui questo Reportage si aggiunge (vedi lib/activitySave.ts).
   * reportCompletion/completionNote sono Fase 4 di docs/navigator-orizzonti-roadmap.md —
   * opt-in esplicito, mai automatico (default deselezionato). */
  onSave: (title: string, reportCompletion: boolean, completionNote: string) => Promise<void>
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
 * End-of-navigation review, same purpose as the /upload import's "parsed"
 * confirmation step: show the computed stats, let the hiker edit the title,
 * and require an explicit Save (or Discard) instead of silently saving —
 * same UX contract as importing an external GPX/FIT/TCX file.
 */
export default function EndHikeReviewDialog({ activity, defaultTitle, onSave, onDiscard }: Props) {
  const [title, setTitle] = useState(defaultTitle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reportCompletion, setReportCompletion] = useState(false)
  const [completionNote, setCompletionNote] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(title, reportCompletion, completionNote)
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
          <h2 className="text-lg font-bold font-display text-stone-900">Escursione completata</h2>
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
          placeholder="Nome dell'escursione"
        />

        <div className="mb-5 p-3 rounded-xl bg-stone-50 border border-stone-200">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reportCompletion}
              onChange={(e) => setReportCompletion(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-forest-500 shrink-0"
            />
            <span className="text-xs text-stone-600 font-body leading-relaxed">
              Segnala di aver completato questo sentiero, per aiutare altri escursionisti a
              sapere che è stato percorso di recente. Facoltativo, nessun dato personale
              condiviso.
            </span>
          </label>
          {reportCompletion && (
            <div className="mt-2.5">
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                placeholder="Nota facoltativa (es. condizioni del sentiero) — visibile ad altri escursionisti"
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-800 font-body resize-none focus:outline-none focus:ring-2 focus:ring-forest-400"
              />
              <p className="text-[11px] text-stone-400 font-body text-right mt-0.5">
                {completionNote.length}/{MAX_NOTE_LENGTH}
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 font-body mb-3">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-forest-500 text-white font-semibold font-body text-sm hover:bg-forest-600 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Salvataggio…' : 'Salva'}
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
