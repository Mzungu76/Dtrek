'use client'
import { useEffect, useState } from 'react'
import { PersonStanding, Loader2 } from 'lucide-react'

type Gender = 'maschio' | 'femmina' | 'altro' | 'non_specificato'

const GENDER_OPTS: { key: Gender; label: string }[] = [
  { key: 'maschio',          label: 'Maschio' },
  { key: 'femmina',          label: 'Femmina' },
  { key: 'altro',            label: 'Altro' },
  { key: 'non_specificato',  label: 'Non specificare' },
]

/** Dati biometrici usati dalla guida AI e dai calcoli fisiologici. Piano di ristrutturazione, Parte 2.4. */
export default function SectionBiometria() {
  const [age,     setAge]     = useState(0)
  const [weight,  setWeight]  = useState(0)
  const [height,  setHeight]  = useState(0)
  const [gender,  setGender]  = useState<Gender>('non_specificato')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [status,  setStatus]  = useState<{ ok: boolean; msg: string } | null>(null)

  // Derived FCmax via Tanaka: 211 − 0.64 × age
  const derivedFCmax = age >= 10 && age <= 90 ? Math.round(211 - 0.64 * age) : 0

  useEffect(() => {
    fetch('/api/user-settings')
      .then(r => r.json())
      .then(d => {
        if (d.userAge)      setAge(d.userAge)
        if (d.userWeightKg) setWeight(d.userWeightKg)
        if (d.userHeightCm) setHeight(d.userHeightCm)
        if (d.userGender)   setGender(d.userGender)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true); setStatus(null)
    const body: Record<string, number | string> = {}
    if (age > 0)    body.userAge      = age
    if (weight > 0) body.userWeightKg = weight
    if (height > 0) body.userHeightCm = height
    body.userGender = gender
    const res = await fetch('/api/user-settings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setStatus({ ok: false, msg: json?.error ?? 'Errore durante il salvataggio.' })
    } else {
      setStatus({ ok: true, msg: 'Dati salvati correttamente.' })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <PersonStanding className="w-5 h-5 text-forest-600 shrink-0" />
        <div>
          <h2 className="text-sm font-semibold text-stone-800">Dati biometrici</h2>
          <p className="text-xs text-stone-400">Parametri fisiologici usati per la valutazione AI dei percorsi</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Caricamento…
        </div>
      ) : (
        <>
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
            <p className="text-xs text-forest-700 bg-forest-50 rounded-lg px-3 py-1.5">
              FC max derivata (formula Tanaka): <span className="font-bold">{derivedFCmax} bpm</span>
            </p>
          )}

          <div>
            <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wider">Sesso</p>
            <div className="grid grid-cols-2 gap-2">
              {GENDER_OPTS.map(opt => (
                <button key={opt.key} onClick={() => { setGender(opt.key); setStatus(null) }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    gender === opt.key
                      ? 'border-forest-500 bg-forest-50 text-forest-800'
                      : 'border-stone-200 text-stone-500 hover:border-forest-200'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 mt-1.5 leading-relaxed">
              Usato dalla guida AI per l&apos;accordo grammaticale di genere (es. &quot;pronto/a&quot;, &quot;stanco/a&quot;).
            </p>
          </div>

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
