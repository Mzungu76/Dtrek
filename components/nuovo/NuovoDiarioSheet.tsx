'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookMarked, Loader2, Plus, X } from 'lucide-react'
import type { DiarySummary } from '@/app/api/diaries/route'

interface Props {
  open: boolean
  onClose: () => void
  /** "gpx" = "Crea un percorso" (/upload?tab=gpx), "activity" = "Crea un Resoconto"
   *  (/upload?tab=activity, il default della pagina) — decisa dal chiamante in base alla sezione
   *  attiva (Percorsi vs il resto), non da questo componente. */
  tab: 'activity' | 'gpx'
}

// Sheet "in quale Diario?" — redesign menù globale, fase 3. Il tap su "Nuovo" nella barra globale
// non ha un Diario di contesto (a differenza del composer dentro un Diario specifico, rimosso in
// fase 1): invece di assegnarlo in automatico al Diario di default lato server (comportamento
// preesistente di app/api/planned/route.ts per i flussi senza diaryId), si chiede sempre — anche
// con un solo Diario esistente, per coerenza, nessun caso speciale silenzioso.
export default function NuovoDiarioSheet({ open, onClose, tab }: Props) {
  const router = useRouter()
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    setDiaries(null)
    setError(null)
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [open])

  if (!open) return null

  function goTo(diaryId: string) {
    onClose()
    router.push(`/upload?tab=${tab}&diaryId=${encodeURIComponent(diaryId)}`)
  }

  async function handleCreateDiario() {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/diaries', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message ?? 'Impossibile creare il Diario.')
        return
      }
      goTo(data.id)
    } catch {
      setError('Errore di rete. Riprova.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 max-h-[75vh] flex flex-col bg-white rounded-t-3xl shadow-2xl pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <p className="text-[15px] font-bold text-stone-800">
              {tab === 'gpx' ? 'Nuovo percorso — in quale Diario?' : 'Nuova uscita — in quale Diario?'}
            </p>
            <p className="text-[12px] text-stone-400">Ogni Percorso e ogni Reportage appartengono a un Diario</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi" className="text-stone-400 hover:text-stone-600 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">{error}</p>
          )}

          {diaries === null && !error ? (
            <div className="flex items-center justify-center py-10 text-stone-400 gap-3">
              <Loader2 className="w-5 h-5 animate-spin" /><span>Caricamento…</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {diaries?.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => goTo(d.id)}
                  className="flex items-center gap-3 bg-stone-50 hover:bg-stone-100 rounded-2xl px-4 py-3.5 border border-stone-200 hover:border-forest-300 transition-colors text-left"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${d.coverUrl ? '' : 'bg-forest-50'}`}>
                    {d.coverUrl
                      ? <img src={d.coverUrl} alt="" className="w-11 h-11 rounded-xl object-cover" />
                      : <BookMarked className="w-5 h-5 text-forest-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-stone-800 truncate">{d.title}</p>
                    <p className="text-[12px] text-stone-500">
                      {d.percorsiCount} {d.percorsiCount === 1 ? 'percorso' : 'percorsi'}
                      {d.isDefault ? ' · Diario di default' : ''}
                    </p>
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={handleCreateDiario}
                disabled={creating}
                className="flex items-center gap-3 rounded-2xl px-4 py-3.5 border-2 border-dashed border-stone-200 hover:border-forest-300 transition-colors text-left disabled:opacity-60"
              >
                <div className="w-11 h-11 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </div>
                <p className="text-[14px] font-bold text-stone-700">Nuovo Diario</p>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
