'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAllActivities, getActivityById, type ActivityMeta } from '@/lib/blobStore'
import { plannedFromActivity } from '@/lib/plannedFromActivity'
import { savePlanned } from '@/lib/plannedStore'
import { CheckCircle, Loader2 } from 'lucide-react'
import { defaultPendingExpiresAt } from './sharedHelpers'

// ── Da diario esistente (clona un'attività conclusa) ──────────────────────────

export default function FromActivityUploader() {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityMeta[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving,      setSaving]     = useState(false)
  const [errorMsg,    setErrorMsg]   = useState('')

  useEffect(() => { getAllActivities().then(setActivities).catch(() => setActivities([])) }, [])

  const handleSave = async () => {
    if (!selectedId) return
    setSaving(true); setErrorMsg('')
    try {
      const activity = await getActivityById(selectedId)
      if (!activity) throw new Error('Attività non trovata')
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = plannedFromActivity(activity, pendingExpiresAt)
      await savePlanned(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  if (activities === null) return (
    <div className="flex items-center justify-center py-12 text-stone-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Caricamento resoconti…
    </div>
  )

  if (activities.length === 0) return (
    <p className="text-sm text-stone-400 text-center py-12">
      Non hai ancora resoconti conclusi da cui ripartire.
    </p>
  )

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {activities.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all
              ${selectedId === a.id ? 'border-sky-400 bg-sky-50 shadow-sm' : 'border-stone-200 bg-white hover:border-sky-300'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-stone-800 truncate">{a.title ?? 'Escursione'}</span>
              <span className="text-[10px] text-stone-400 shrink-0">
                {new Date(a.startTime).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex gap-3 text-[10px] text-stone-400 mt-0.5">
              <span>{(a.distanceMeters / 1000).toFixed(1)} km</span>
              <span>{Math.round(a.elevationGain)} m D+</span>
            </div>
          </button>
        ))}
      </div>
      {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
      <button onClick={handleSave} disabled={!selectedId || saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />} Rifai questo percorso
      </button>
    </div>
  )
}
