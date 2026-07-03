'use client'
import { useState } from 'react'
import { Navigation as NavigationIcon, Trash2, Loader2 } from 'lucide-react'

/** Cronologia navigazione GPS / cancellazione dati. Piano di ristrutturazione, Parte 2.4. */
export default function SectionCronologiaNavigazione() {
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [status,     setStatus]     = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleDelete() {
    setDeleting(true); setStatus(null)
    try {
      const res = await fetch('/api/navigation/history', { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Errore ${res.status}`)
      setStatus({ ok: true, msg: 'Cronologia di navigazione cancellata (sessioni, eventi e tracce GPS).' })
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : 'Errore durante la cancellazione.' })
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <NavigationIcon className="w-5 h-5 text-forest-600 shrink-0" />
        <h2 className="text-sm font-semibold text-stone-800">Cronologia navigazione GPS</h2>
      </div>
      <p className="text-xs text-stone-500 mb-4 ml-7 leading-relaxed">
        Durante ogni &quot;Navigazione attiva&quot; salviamo lato server la sessione, gli eventi
        (fuori-percorso, GPS perso, POI raggiunti…) e la traccia GPS grezza, per poterla consultare in futuro.
        Puoi cancellare definitivamente questi dati in qualsiasi momento — le tue escursioni salvate nel diario
        non vengono toccate.
      </p>

      <div className="ml-7">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={deleting}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Cancella cronologia di navigazione
          </button>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-stone-600">Sicuro? L&apos;operazione non è reversibile.</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold transition"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Conferma cancellazione
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="text-xs text-stone-500 hover:text-stone-700 font-medium disabled:opacity-50"
            >
              Annulla
            </button>
          </div>
        )}
      </div>

      {status && (
        <p className={`mt-3 ml-7 text-xs font-medium ${status.ok ? 'text-forest-600' : 'text-red-600'}`}>
          {status.ok ? '✓ ' : '✗ '}{status.msg}
        </p>
      )}
    </div>
  )
}
