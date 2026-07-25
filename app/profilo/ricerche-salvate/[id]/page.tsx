'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { FoundRouteCard, BuiltRouteCard } from '@/components/RouteResultCard'
import type { ResultItem } from '@/components/upload/RouteBuilder'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'

interface SearchHistoryDetail {
  id: string
  created_at: string
  mode: 'esistenti' | 'su_misura'
  query: string | null
  place_name: string | null
  result_count: number
  results: ResultItem[]
}

/**
 * Dettaglio di una ricerca salvata — ri-mostra `results` (traccia reale/POI/punteggio già inclusi,
 * vedi lib/routeBuilder/searchHistory.ts) con le stesse FoundRouteCard/BuiltRouteCard del wizard
 * originale, SENZA nessuna nuova chiamata Overpass/DTM: è un archivio, non una nuova ricerca.
 */
export default function RicercaSalvataDetailPage() {
  const params = useParams<{ id: string }>()
  const [search, setSearch] = useState<SearchHistoryDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!params?.id) return
    fetch(`/api/route-build/search-history/${encodeURIComponent(params.id)}`)
      .then(res => res.json())
      .then(data => {
        if (data?.search) setSearch(data.search)
        else setError(data?.error || 'Ricerca non trovata.')
      })
      .catch(() => setError('Errore di rete.'))
  }, [params?.id])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-8 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <BackLink fallbackHref="/profilo/ricerche-salvate" className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-1" />

        {!search && !error && (
          <div className="flex items-center justify-center py-16 text-stone-400 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" /><span>Caricamento…</span>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>}

        {search && (
          <>
            <div className="mb-2">
              <h1 className="font-display text-2xl font-bold text-forest-900 mb-1">{search.place_name || search.query || 'Ricerca salvata'}</h1>
              <p className="text-stone-400 text-sm">
                {search.mode === 'su_misura' ? 'Su misura' : 'Esistenti'} · {search.result_count} percors{search.result_count === 1 ? 'o' : 'i'} · {format(new Date(search.created_at), 'd MMMM yyyy, HH:mm', { locale: it })}
              </p>
            </div>

            <div className="space-y-3">
              {search.results.map((item, i) => item.kind === 'found'
                ? <FoundRouteCard key={`found-${i}`} data={item.data} />
                : <BuiltRouteCard key={`built-${i}`} data={item.data} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
