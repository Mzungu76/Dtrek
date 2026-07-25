'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Loader2, Search, Route, FolderSearch } from 'lucide-react'

interface SearchHistoryRow {
  id: string
  created_at: string
  mode: 'esistenti' | 'su_misura'
  query: string | null
  place_name: string | null
  result_count: number
}

/**
 * Elenco delle ricerche salvate del route builder (vedi lib/routeBuilder/searchHistory.ts) —
 * "Costruisci o trova un percorso" salva ogni ricerca riuscita per intero (traccia/POI/punteggio
 * inclusi), qui se ne vede solo l'elenco leggero (nessun `results` JSONB, quello arriva solo nel
 * dettaglio) per restare veloce anche con molte ricerche salvate.
 */
export default function RicercheSalvatePage() {
  const [searches, setSearches] = useState<SearchHistoryRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/route-build/search-history')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data?.searches)) setSearches(data.searches)
        else setError(data?.error || 'Lettura non riuscita.')
      })
      .catch(() => setError('Errore di rete.'))
  }, [])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-8 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <BackLink className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-1" />
        <div className="mb-2">
          <h1 className="font-display text-2xl font-bold text-forest-900 mb-1">Le mie ricerche</h1>
          <p className="text-stone-400 text-sm">Ricerche salvate da &quot;Costruisci o trova un percorso&quot; — riapri per rivedere gli stessi risultati, senza ricalcolare nulla.</p>
        </div>

        {searches === null && !error && (
          <div className="flex items-center justify-center py-16 text-stone-400 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" /><span>Caricamento…</span>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}

        {searches?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mb-4">
              <FolderSearch className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-500 text-sm max-w-xs">Nessuna ricerca salvata finora — ogni ricerca riuscita in &quot;Costruisci o trova un percorso&quot; comparirà qui.</p>
          </div>
        )}

        <div className="space-y-2.5">
          {searches?.map(s => (
            <Link key={s.id} href={`/profilo/ricerche-salvate/${encodeURIComponent(s.id)}`}
              className="flex items-center gap-3 bg-white rounded-2xl border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.mode === 'su_misura' ? 'bg-forest-50 text-forest-600' : 'bg-terra-50 text-terra-600'}`}>
                {s.mode === 'su_misura' ? <Route className="w-4.5 h-4.5" /> : <Search className="w-4.5 h-4.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-stone-800 truncate">{s.place_name || s.query || 'Ricerca senza nome'}</p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {s.mode === 'su_misura' ? 'Su misura' : 'Esistenti'} · {s.result_count} percors{s.result_count === 1 ? 'o' : 'i'} · {format(new Date(s.created_at), 'd MMM yyyy, HH:mm', { locale: it })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
