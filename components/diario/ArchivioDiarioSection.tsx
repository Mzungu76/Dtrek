'use client'
// Archiviazione del Diario — restyling pagina /diari, Fase 2 di docs/diari-restyling-piano.md.
// SEMPRE una scelta dell'utente, mai un job che la valorizza da solo: un Diario che sparisce dalla
// pagina di atterraggio senza che nessuno l'abbia chiesto sarebbe peggio del problema che
// l'archiviazione risolve (elenco lungo). L'unico automatismo ammesso è la PROPOSTA — mostrare
// questa sezione con più risalto quando il Diario non ha uscite da tempo — non ancora costruita
// qui: per ora la sezione è sempre disponibile, in fondo al Sommario, come la sua gemella
// DeleteDiarioSection.
import { useState } from 'react'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'

interface Props {
  diaryId: string
  archivedAt: string | null
  onChange: (archivedAt: string | null) => void
}

export function ArchivioDiarioSection({ diaryId, archivedAt, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function salva(prossimoArchivedAt: string | null) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivedAt: prossimoArchivedAt }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      onChange(data.archivedAt)
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (archivedAt) {
    return (
      <div className="mt-4">
        <button
          onClick={() => salva(null)}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-stone-600 hover:bg-stone-100 transition-colors text-sm font-medium disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
          Riattiva questo Diario
        </button>
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <div className="mt-4">
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-stone-600 hover:bg-stone-100 transition-colors text-sm font-medium"
        >
          <Archive className="w-4 h-4" /> Archivia questo Diario
        </button>
      ) : (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 max-w-lg space-y-3">
          <p className="text-sm text-stone-700">
            Il Diario esce dall&rsquo;elenco principale di &ldquo;I miei Diari&rdquo; e va in Archivio — resta
            comunque raggiungibile e pubblicabile, si può riattivare in qualsiasi momento.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={() => salva(new Date().toISOString())}
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 bg-stone-700 hover:bg-stone-800 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Archivia
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
