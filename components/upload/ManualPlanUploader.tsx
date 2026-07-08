'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { savePlanned, type PlannedHike } from '@/lib/plannedStore'
import { CheckCircle, Loader2 } from 'lucide-react'
import { defaultPendingExpiresAt } from './sharedHelpers'

// ── Manuale (senza file) ──────────────────────────────────────────────────────

export default function ManualPlanUploader() {
  const router = useRouter()
  const [title,     setTitle]     = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [elevGain,  setElevGain]  = useState('')
  const [durationH, setDurationH] = useState('')
  const [durationM, setDurationM] = useState('')
  const [date,      setDate]      = useState('')
  const [saving,    setSaving]    = useState(false)
  const [errorMsg,  setErrorMsg]  = useState('')

  const valid = title.trim().length > 0 && parseFloat(distanceKm) > 0

  const handleSave = async () => {
    if (!valid) return
    setSaving(true); setErrorMsg('')
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike: PlannedHike = {
        id: 'manual_' + Date.now().toString(36),
        title: title.trim(),
        plannedDate: date || undefined,
        createdAt: new Date().toISOString(),
        distanceMeters: parseFloat(distanceKm) * 1000,
        elevationGain: parseFloat(elevGain) || 0,
        elevationLoss: 0,
        altitudeMax: 0,
        altitudeMin: 0,
        estimatedTimeSeconds: (parseInt(durationH) || 0) * 3600 + (parseInt(durationM) || 0) * 60,
        pendingExpiresAt,
      }
      await savePlanned(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setErrorMsg(`Errore nel salvataggio: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-600 mb-1">Nome del percorso</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="es. Anello del Monte Amiata"
          className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Distanza (km)</label>
          <input value={distanceKm} onChange={e => setDistanceKm(e.target.value)} type="number" min="0" step="0.1"
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Dislivello + (m)</label>
          <input value={elevGain} onChange={e => setElevGain(e.target.value)} type="number" min="0"
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">Durata stimata</label>
          <div className="flex gap-2">
            <input value={durationH} onChange={e => setDurationH(e.target.value)} type="number" min="0" placeholder="h"
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
            <input value={durationM} onChange={e => setDurationM(e.target.value)} type="number" min="0" max="59" placeholder="min"
              className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-800 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-600 mb-1">
            Data <span className="font-normal text-stone-400">(opzionale)</span>
          </label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-stone-300 rounded-xl px-3 py-2 text-sm text-stone-700 bg-stone-50 outline-none focus:border-sky-400 focus:bg-white" />
        </div>
      </div>
      {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
      <button onClick={handleSave} disabled={!valid || saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />} Crea guida
      </button>
      <p className="text-xs text-stone-400">
        Senza traccia GPS la guida non avrà mappa o profilo altimetrico, ma verrà comunque generata.
      </p>
    </div>
  )
}
