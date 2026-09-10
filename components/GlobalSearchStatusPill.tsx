'use client'
import { useSyncExternalStore, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, X, AlertTriangle } from 'lucide-react'
import { subscribe, getSnapshot, dismiss } from '@/lib/routeBuilder/backgroundSearchStore'

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Indicatore globale (montato una volta in app/layout.tsx) di una ricerca/generazione "Costruisci o
 * trova un percorso" in corso o appena finita — visibile su QUALSIASI pagina dell'app, non solo sul
 * wizard che l'ha avviata (vedi lib/routeBuilder/backgroundSearchStore.ts per il perché: la ricerca
 * prosegue anche navigando altrove). Si silenzia da sé mentre il wizard stesso è montato e mostra
 * già il proprio indicatore (state.suppressed), per non duplicare la stessa informazione.
 */
export default function GlobalSearchStatusPill() {
  const router = useRouter()
  const state = useSyncExternalStore(subscribe, getSnapshot, () => getSnapshot())
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (state.status !== 'running' || state.startedAt == null) return
    const tick = () => setElapsed(Math.floor((Date.now() - (state.startedAt as number)) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [state.status, state.startedAt])

  if (state.status === 'idle' || state.suppressed) return null

  const modeLabel = state.mode === 'su_misura' ? 'Su misura' : 'Esistenti'

  return (
    <div
      className="fixed z-40 right-4 flex items-center gap-2.5 bg-stone-800 text-white rounded-full shadow-lg pl-4 pr-2 py-2.5 max-w-[calc(100vw-2rem)]"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      {state.status === 'running' && (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-terra-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{state.stage || `Genero (${modeLabel})…`}</p>
            <p className="text-[10px] text-white/50 font-mono tabular-nums">{formatElapsed(elapsed)}</p>
          </div>
        </>
      )}
      {state.status === 'done' && (
        <button
          onClick={() => { if (state.searchHistoryId) router.push(`/profilo/ricerche-salvate/${encodeURIComponent(state.searchHistoryId)}`); dismiss() }}
          className="flex items-center gap-2.5"
        >
          <CheckCircle2 className="w-4 h-4 text-forest-400 shrink-0" />
          <span className="text-xs font-semibold">
            Percorso pronto{state.resultCount ? ` — ${state.resultCount} risultat${state.resultCount === 1 ? 'o' : 'i'}` : ''}
          </span>
        </button>
      )}
      {state.status === 'error' && (
        <>
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold truncate">{state.errorMessage || 'Ricerca non riuscita'}</span>
        </>
      )}
      {state.status !== 'running' && (
        <button onClick={() => dismiss()} aria-label="Chiudi" className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
