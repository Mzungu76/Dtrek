'use client'
import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { validateSlug } from '@/lib/profileSlug'

// Il sito personale dell'utente (/u/[slug]) — Fase 3 del piano di pubblicazione (docs/raccolte-
// pubblicazione-piano.md): un solo link che raccoglie Raccolte/Diari/Reportage già pubblicati.
// ("Profilo pubblico" era il nome della Fase 3 quando questo componente è nato — internamente è
// rimasto così (nome del file, del componente, colonne del DB), ma per l'utente è "il tuo sito":
// non una vetrina personale a sé, è l'unico indirizzo dove i suoi contenuti pubblicati compaiono.)
// Due stati distinti: lo SLUG (l'indirizzo, stabile una volta scelto) e l'INTERRUTTORE (la
// visibilità, spegnibile senza perdere l'indirizzo scelto).
export default function SectionProfiloPubblico() {
  const [slug, setSlug] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [savingSlug, setSavingSlug] = useState(false)
  const [togglingEnabled, setTogglingEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copyOk, setCopyOk] = useState(false)

  useEffect(() => {
    fetch('/api/user-settings/profile')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(d => { setSlug(d.slug ?? null); setDraft(d.slug ?? ''); setEnabled(!!d.enabled) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function saveSlug() {
    const clientError = validateSlug(draft)
    if (clientError) { setError(clientError); return }
    setSavingSlug(true); setError(null)
    try {
      const res = await fetch('/api/user-settings/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: draft }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      setSlug(draft.trim().toLowerCase())
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingSlug(false)
    }
  }

  async function toggleEnabled() {
    const next = !enabled
    setTogglingEnabled(true); setError(null)
    try {
      const res = await fetch('/api/user-settings/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      setEnabled(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTogglingEnabled(false)
    }
  }

  if (!loaded) return null

  const publicUrl = slug && typeof window !== 'undefined' ? `${window.location.origin}/u/${slug}` : ''

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
      <div>
        <label className="block text-sm font-semibold text-stone-700 mb-2">Il tuo indirizzo</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-400 shrink-0">/u/</span>
          <input
            type="text" value={draft}
            onChange={e => { setDraft(e.target.value); setSaved(false); setError(null) }}
            placeholder="marco-rossi"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-stone-800"
          />
          <button
            onClick={saveSlug} disabled={savingSlug || draft.trim().toLowerCase() === slug}
            className={`shrink-0 px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
              saved ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {savingSlug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : 'Salva'}
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-2 leading-relaxed">
          Un alias pubblico — puoi cambiare il tuo nome visualizzato senza dover cambiare questo indirizzo.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {slug && (
        <div className="pt-3 border-t border-stone-100 space-y-2.5">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-semibold text-stone-700">Sito attivo</span>
            <input
              type="checkbox" checked={enabled} disabled={togglingEnabled}
              onChange={toggleEnabled}
              className="w-4 h-4"
            />
          </label>
          {enabled && (
            <div className="flex items-center gap-2 flex-wrap">
              <a href={`/u/${slug}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-bold uppercase tracking-wide transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Apri il tuo sito
              </a>
              <button
                onClick={async () => { await navigator.clipboard.writeText(publicUrl); setCopyOk(true); setTimeout(() => setCopyOk(false), 2000) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
