'use client'
import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { TcxActivity } from '@/lib/tcxParser'

interface Props {
  activity: TcxActivity
  defaultTitle: string
  /** mode 'overwrite' consumes the linked planned hike into this activity (same as before);
   * 'new' saves this as an independent activity and leaves the planned hike untouched, so it
   * can be hiked again later. */
  onSave: (title: string, mode: 'overwrite' | 'new') => Promise<void>
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
  const [saving, setSaving] = useState<'overwrite' | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (mode: 'overwrite' | 'new') => {
    setSaving(mode)
    setError(null)
    try {
      await onSave(title, mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio')
      setSaving(null)
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

        {error && <p className="text-sm text-red-600 font-body mb-3">{error}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleSave('new')}
            disabled={!!saving}
            className="w-full py-2.5 rounded-xl bg-forest-500 text-white font-semibold font-body text-sm hover:bg-forest-600 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {saving === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving === 'new' ? 'Salvataggio…' : 'Salva come nuovo percorso'}
          </button>
          <button
            onClick={() => handleSave('overwrite')}
            disabled={!!saving}
            title="Il percorso pianificato viene eliminato e sostituito da questa escursione registrata"
            className="w-full py-2.5 rounded-xl border border-forest-300 text-forest-700 font-semibold font-body text-sm hover:bg-forest-50 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving === 'overwrite' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving === 'overwrite' ? 'Salvataggio…' : 'Sovrascrivi il percorso pianificato'}
          </button>
          <button
            onClick={onDiscard}
            disabled={!!saving}
            className="w-full py-2 text-stone-500 font-semibold font-body text-sm hover:text-stone-700 disabled:opacity-50"
          >
            Scarta
          </button>
        </div>
      </div>
    </div>
  )
}
