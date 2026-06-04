'use client'
import { useEffect, useRef, useState } from 'react'
import Navbar from '@/components/Navbar'
import { getProfile, saveProfile } from '@/lib/userProfile'
import { getAllPlanned, updatePlannedMeta } from '@/lib/plannedStore'
import { computeTrailScore } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import {
  User, Camera, Check, Trash2, Key, Eye, EyeOff,
  Loader2, ShieldCheck, Sparkles, Lock, Leaf, PersonStanding, Footprints, Timer,
} from 'lucide-react'

// ── Claude API key section ─────────────────────────────────────────────────

function ClaudeKeySection() {
  const [hasKey,   setHasKey]   = useState(false)
  const [keyHint,  setKeyHint]  = useState<string | null>(null)
  const [input,    setInput]    = useState('')
  const [showKey,  setShowKey]  = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [status,   setStatus]   = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => { setHasKey(d.hasKey); setKeyHint(d.keyHint) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!input.trim()) return
    setSaving(true); setStatus(null)
    const res  = await fetch('/api/user-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: input.trim() }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      setHasKey(true); setKeyHint(data.keyHint); setInput('')
      setStatus({ ok: true, msg: 'Chiave salvata correttamente.' })
    } else {
      setStatus({ ok: false, msg: data.error ?? 'Errore durante il salvataggio.' })
    }
  }

  async function handleDelete() {
    setDeleting(true); setStatus(null)
    const res = await fetch('/api/user-settings', { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) { setHasKey(false); setKeyHint(null); setStatus({ ok: true, msg: 'Chiave rimossa.' }) }
    else setStatus({ ok: false, msg: 'Errore durante la rimozione.' })
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <Key className="w-5 h-5 text-forest-600 shrink-0" />
        <h2 className="text-sm font-semibold text-stone-800">Chiave API Claude</h2>
      </div>
      <p className="text-xs text-stone-500 mb-4 ml-7 leading-relaxed">
        Inserisci la tua chiave personale di{' '}
        <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer"
           className="underline text-forest-600 hover:text-forest-700">
          Anthropic Console
        </a>{' '}
        per generare guide turistiche AI sui tuoi percorsi pianificati.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs ml-7">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : hasKey ? (
        /* Key already saved */
        <div className="ml-7 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-forest-50 border border-forest-200">
            <ShieldCheck className="w-4 h-4 text-forest-600 shrink-0" />
            <span className="text-xs font-mono text-forest-800 flex-1">{keyHint}</span>
            <span className="text-[10px] font-medium text-forest-600 bg-forest-100 px-1.5 py-0.5 rounded-full">attiva</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setHasKey(false); setKeyHint(null) }}
              className="text-xs text-forest-600 hover:text-forest-700 font-medium"
            >
              Sostituisci
            </button>
            <span className="text-stone-300">·</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Rimuovi
            </button>
          </div>
        </div>
      ) : (
        /* Input for new key */
        <div className="ml-7 space-y-2">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={input}
              onChange={e => { setInput(e.target.value); setStatus(null) }}
              placeholder="sk-ant-api03-…"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 pr-10 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !input.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salva chiave
          </button>
        </div>
      )}

      {status && (
        <p className={`mt-3 ml-7 text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}

// ── Subscription teaser ────────────────────────────────────────────────────

function SubscriptionTeaser() {
  return (
    <div className="relative bg-gradient-to-br from-forest-800 to-forest-950 rounded-2xl p-6 overflow-hidden">
      {/* decorative glow */}
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-forest-400/20 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">DTrek AI</h2>
            <span className="text-[10px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
              Prossimamente
            </span>
          </div>
          <p className="text-xs text-forest-300 mt-0.5">Guide AI senza bisogno di una chiave personale</p>
        </div>
      </div>

      <ul className="space-y-1.5 mb-4 ml-12">
        {[
          'Accesso alle guide turistiche AI incluso',
          'Analisi avanzata dei percorsi',
          'Sincronizzazione multi-dispositivo illimitata',
        ].map(item => (
          <li key={item} className="flex items-center gap-2 text-xs text-forest-200">
            <Check className="w-3.5 h-3.5 text-forest-400 shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      <button
        disabled
        className="ml-12 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/50 text-xs font-medium cursor-not-allowed border border-white/10"
      >
        <Lock className="w-3.5 h-3.5" />
        Disponibile prossimamente
      </button>
    </div>
  )
}

// ── TrailScore / biometric settings ───────────────────────────────────────────

function LootSettingsSection() {
  const [age,       setAge]       = useState(0)
  const [weight,    setWeight]    = useState(0)
  const [height,    setHeight]    = useState(0)
  const [naturaW,   setNaturaW]   = useState(50)
  const [sforzaW,   setSforzaW]   = useState(50)
  const [duraW,     setDuraW]     = useState(270)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [status,    setStatus]    = useState<{ ok: boolean; msg: string } | null>(null)

  // Derived FCmax via Tanaka: 211 − 0.64 × age
  const derivedFCmax = age >= 10 && age <= 90 ? Math.round(211 - 0.64 * age) : 0

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.userAge)        setAge(d.userAge)
        if (d.userWeightKg)   setWeight(d.userWeightKg)
        if (d.userHeightCm)   setHeight(d.userHeightCm)
        if (d.beautyNaturaWeight !== undefined) setNaturaW(d.beautyNaturaWeight)
        if (d.prefSforzo         !== undefined) setSforzaW(d.prefSforzo)
        if (d.prefDurata         !== undefined) setDuraW(d.prefDurata)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setStatus(null)
    const body: Record<string, number> = { beautyNaturaWeight: naturaW, prefSforzo: sforzaW, prefDurata: duraW }
    if (age > 0)    body.userAge       = age
    if (weight > 0) body.userWeightKg  = weight
    if (height > 0) body.userHeightCm  = height
    const res = await fetch('/api/user-settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSaving(false)
      setStatus({ ok: false, msg: json?.error ?? 'Errore durante il salvataggio.' })
      return
    }

    // Ricalcola i TrailScore di tutti i percorsi pianificati con le nuove preferenze e
    // sovrascrive immediatamente il valore in database. Nessun ricalcolo avverrà mai
    // al semplice caricamento delle pagine.
    setStatus({ ok: true, msg: 'Salvato. Aggiornamento punteggi in corso…' })
    try {
      const prefs = {
        userAge:       age > 0 ? age : undefined,
        personalDelta: (json.personalDelta ?? undefined) as number | undefined,
        hrHikeCount:   0 as number,
        prefSforzo:    sforzaW,
        prefDurata:    duraW,
      }
      const hikes = await getAllPlanned()
      const updates = hikes
        .filter(h => (h.cachedBeautyScore?.categories?.length ?? 0) > 0)
        .map(h => {
          const bs = h.cachedBeautyScore as BeautyScore
          const { ts } = computeTrailScore(bs, {
            distanceMeters: h.distanceMeters,
            elevationGain:  h.elevationGain,
            elevationLoss:  h.elevationLoss,
            altitudeMax:    h.altitudeMax,
            ...prefs,
          }, naturaW)
          return { id: h.id, ts }
        })
      await Promise.all(updates.map(u => updatePlannedMeta(u.id, { cachedTrailScore: u.ts })))
      setStatus({ ok: true, msg: `Profilo salvato · ${updates.length} punteggi aggiornati.` })
    } catch {
      setStatus({ ok: true, msg: 'Profilo salvato.' })
    } finally {
      setSaving(false)
    }
  }

  const culturaW = 100 - naturaW

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-bold text-forest-700">TS</span>
        <div>
          <h2 className="text-sm font-semibold text-stone-800">TrailScore — profilo personale</h2>
          <p className="text-xs text-stone-400">Parametri fisiologici per il calcolo della fatica reale</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <>
          {/* Biometric profile */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-3">
              <PersonStanding className="w-4 h-4 text-forest-600" />
              Dati antropometrici
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">Età</p>
                <div className="relative">
                  <input
                    type="number" min={10} max={90}
                    value={age || ''}
                    onChange={e => { setAge(parseInt(e.target.value) || 0); setStatus(null) }}
                    placeholder="40"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">anni</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">Peso</p>
                <div className="relative">
                  <input
                    type="number" min={30} max={250}
                    value={weight || ''}
                    onChange={e => { setWeight(parseInt(e.target.value) || 0); setStatus(null) }}
                    placeholder="70"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">kg</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-stone-400 mb-1 font-medium uppercase tracking-wider">Altezza</p>
                <div className="relative">
                  <input
                    type="number" min={100} max={250}
                    value={height || ''}
                    onChange={e => { setHeight(parseInt(e.target.value) || 0); setStatus(null) }}
                    placeholder="170"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-mono outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-500/20 transition"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">cm</span>
                </div>
              </div>
            </div>
            {derivedFCmax > 0 && (
              <p className="mt-2 text-xs text-forest-700 bg-forest-50 rounded-lg px-3 py-1.5">
                FC max derivata (formula Tanaka): <span className="font-bold">{derivedFCmax} bpm</span>
              </p>
            )}
          </div>

          {/* Natura / Cultura slider */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-3">
              <Leaf className="w-4 h-4 text-forest-500" />
              Peso bellezza: Natura vs Cultura
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-forest-700 font-semibold w-16">Natura {naturaW}%</span>
              <input
                type="range" min={0} max={100} step={5}
                value={naturaW}
                onChange={e => { setNaturaW(parseInt(e.target.value)); setStatus(null) }}
                className="flex-1 accent-forest-600"
              />
              <span className="text-xs text-amber-700 font-semibold w-20 text-right">Cultura {culturaW}%</span>
            </div>
            <div className="flex justify-between mt-1.5 px-16">
              <span className="text-[10px] text-stone-400">solo paesaggio</span>
              <span className="text-[10px] text-stone-400">solo storia/cultura</span>
            </div>
          </div>

          {/* Sforzo slider: Passeggiata ↔ Sfida */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-3">
              <Footprints className="w-4 h-4 text-terra-500" />
              Sforzo: Passeggiata vs Sfida
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-stone-600 font-semibold w-24 shrink-0">🚶 Passeggiata</span>
              <input
                type="range" min={0} max={100} step={5}
                value={sforzaW}
                onChange={e => { setSforzaW(parseInt(e.target.value)); setStatus(null) }}
                className="flex-1 accent-terra-600"
              />
              <span className="text-xs text-terra-700 font-semibold w-16 text-right shrink-0">Sfida ⚡</span>
            </div>
            <div className="flex justify-between mt-1.5 px-[6.5rem]">
              <span className="text-[10px] text-stone-400">percorsi facili</span>
              <span className="text-[10px] text-stone-400 text-right">amo la fatica</span>
            </div>
          </div>

          {/* Durata slider: 1h – 8h+ con tacche ogni 30min */}
          {(() => {
            const duraLabel = duraW >= 480 ? '8h+'
              : duraW % 60 === 0 ? `${duraW / 60}h`
              : `${Math.floor(duraW / 60)}h 30min`
            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
                    <Timer className="w-4 h-4 text-sky-500" />
                    Durata preferita
                  </label>
                  <span className="text-sm font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full">
                    {duraLabel}
                  </span>
                </div>
                <input
                  type="range" min={60} max={480} step={30}
                  value={duraW}
                  onChange={e => { setDuraW(parseInt(e.target.value)); setStatus(null) }}
                  className="w-full accent-sky-600"
                />
                {/* Tacche ogni 30min — etichette alle ore intere */}
                <div className="relative h-6 mt-0.5">
                  {Array.from({ length: 15 }, (_, i) => {
                    const mins = 60 + i * 30
                    const isHour = mins % 60 === 0
                    const pct = (i / 14) * 100
                    return (
                      <div key={i} className="absolute flex flex-col items-center -translate-x-1/2"
                           style={{ left: `${pct}%` }}>
                        <div className={`w-px ${isHour ? 'h-2 bg-stone-400' : 'h-1.5 bg-stone-200'}`} />
                        {isHour && (
                          <span className="text-[9px] text-stone-400 mt-0.5 whitespace-nowrap">
                            {mins >= 480 ? '8h+' : `${mins / 60}h`}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Salva impostazioni
          </button>
        </>
      )}

      {status && (
        <p className={`text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}

// ── Profile page ───────────────────────────────────────────────────────────

export default function ProfiloPage() {
  const [faceUrl,    setFaceUrl]    = useState<string | null>(null)
  const [name,       setName]       = useState('')
  const [saved,      setSaved]      = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
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
    <div className="min-h-screen bg-stone-50">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-10 space-y-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-stone-900 mb-1">Profilo e impostazioni</h1>
          <p className="text-stone-400 text-sm">Personalizza il tuo account DTrek.</p>
        </div>

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
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
            <div className="flex-1">
              <p className="text-sm text-stone-600 leading-relaxed">
                Carica una foto frontale. Verrà ritagliata circolare e applicata sull'escursionista nei video 3D.
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

        {/* TrailScore settings */}
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">TrailScore</p>
          <LootSettingsSection />
        </div>

        {/* AI settings */}
        <div className="pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">Intelligenza artificiale</p>
          <div className="space-y-3">
            <ClaudeKeySection />
            <SubscriptionTeaser />
          </div>
        </div>
      </div>
    </div>
  )
}
