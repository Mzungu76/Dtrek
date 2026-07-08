'use client'
import { useEffect, useRef, useState } from 'react'
import { getProfile, saveProfile } from '@/lib/userProfile'
import { getAllActivities } from '@/lib/blobStore'
import { computeStreaks } from '@/lib/stats'
import { computeBadges, computeCurrentBadges, type ComputedBadge } from '@/lib/badges'
import { User, Camera, Check, Trash2, Loader2, Trophy } from 'lucide-react'

/** Identità: avatar, nome visualizzato, riepilogo traguardi. Piano di ristrutturazione, Parte 2.4. */
export default function SectionIdentita() {
  const [faceUrl,    setFaceUrl]    = useState<string | null>(null)
  const [name,       setName]       = useState('')
  const [saved,      setSaved]      = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [badgeCount, setBadgeCount] = useState(0)
  const [nextBadge,  setNextBadge]  = useState<ComputedBadge | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Fast local read first
    const p = getProfile()
    if (p.hikerFaceDataUrl) setFaceUrl(p.hikerFaceDataUrl)
    if (p.displayName)      setName(p.displayName)
    // Then sync from Supabase (cross-device)
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.hikerFaceDataUrl) { setFaceUrl(d.hikerFaceDataUrl); saveProfile({ hikerFaceDataUrl: d.hikerFaceDataUrl }) }
        if (d.displayName)      { setName(d.displayName);         saveProfile({ displayName: d.displayName }) }
      })
      .catch(() => {})
    getAllActivities()
      .then(acts => {
        const streaks = computeStreaks(acts)
        const badges = computeBadges(acts, streaks)
        setBadgeCount(computeCurrentBadges(acts, streaks).length)
        const closest = badges
          .filter(b => !b.unlocked && b.progressPct !== undefined)
          .sort((a, b) => (b.progressPct ?? 0) - (a.progressPct ?? 0))[0]
        setNextBadge(closest ?? null)
      })
      .catch(() => {})
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const size   = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 256
        const ctx    = canvas.getContext('2d')!
        ctx.beginPath()
        ctx.arc(128, 128, 128, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 256, 256)
        setFaceUrl(canvas.toDataURL('image/jpeg', 0.85))
        setSaved(false)
      }
      img.src = url
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikerFaceDataUrl: faceUrl ?? null, displayName: name.trim() || null }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? `Errore ${res.status}`)
      }
      // Mirror to localStorage so Navbar / RouteMap3D update immediately in this session
      saveProfile({ hikerFaceDataUrl: faceUrl ?? undefined, displayName: name.trim() || undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Errore durante il salvataggio')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Face upload */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <p className="text-sm font-semibold text-stone-700 mb-4">Foto del volto (avatar escursionista)</p>
        <div className="flex items-center gap-6">
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-amber-100 bg-stone-100 flex items-center justify-center">
              {faceUrl
                ? <img src={faceUrl} alt="Volto" className="w-full h-full object-cover" />
                : <User className="w-10 h-10 text-stone-300" />
              }
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-600 flex items-center justify-center text-white shadow-md transition-colors"
            >
              <Camera className="w-4 h-4" />
            </button>
            {badgeCount > 0 && (
              <a href="/statistiche?tab=traguardi" title={`${badgeCount} traguardi sbloccati`}
                className="absolute -top-2 -left-2 z-10 min-w-[26px] h-[26px] px-1.5 rounded-full bg-forest-600 hover:bg-forest-700 border-2 border-white text-white text-xs font-bold flex items-center justify-center gap-0.5 shadow-lg transition-colors hover:scale-105">
                <Trophy className="w-3.5 h-3.5" />{badgeCount}
              </a>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
          <div className="flex-1">
            <p className="text-sm text-stone-600 leading-relaxed">
              Carica una foto frontale. Verrà ritagliata circolare e applicata sull&apos;escursionista nei video 3D.
            </p>
            {faceUrl && (
              <button
                onClick={() => { setFaceUrl(null); setSaved(false) }}
                className="mt-3 flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Rimuovi foto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Traguardi: riepilogo sbloccati + prossimo obiettivo */}
      {(badgeCount > 0 || nextBadge) && (
        <a href="/statistiche?tab=traguardi"
          className="block bg-white rounded-2xl border border-stone-200 shadow-sm p-6 hover:border-forest-300 transition-colors group">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="text-sm font-semibold text-stone-700 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-forest-600" /> Traguardi
            </p>
            <span className="text-xs font-semibold text-forest-600 group-hover:text-forest-700">
              {badgeCount} sbloccat{badgeCount === 1 ? 'o' : 'i'} →
            </span>
          </div>
          {nextBadge && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm text-stone-600 flex items-center gap-1.5">
                  <span className="text-base">{nextBadge.icon}</span>
                  <span className="font-medium text-stone-700">{nextBadge.name}</span>
                </span>
                <span className="text-xs text-stone-400 font-mono shrink-0">
                  {nextBadge.progressCurrent}{nextBadge.progressUnit} / {nextBadge.progressTarget}{nextBadge.progressUnit}
                </span>
              </div>
              <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-forest-400 to-forest-600 rounded-full transition-all"
                  style={{ width: `${nextBadge.progressPct}%` }} />
              </div>
              <p className="text-xs text-stone-400 mt-1.5">Prossimo traguardo — {nextBadge.progressPct}% completato</p>
            </div>
          )}
        </a>
      )}

      {/* Display name */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <label className="block text-sm font-semibold text-stone-700 mb-3">
          Nome da visualizzare nei video
        </label>
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setSaved(false) }}
          placeholder="es. Marco 🏔️"
          className="w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-800"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
          saved ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white shadow-md'
        }`}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Salvato!</> : 'Salva profilo'}
      </button>
      {saveError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{saveError}</p>
      )}
    </div>
  )
}
