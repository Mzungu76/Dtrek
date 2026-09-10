'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import { FoundRouteCard, BuiltRouteCard } from '@/components/RouteResultCard'
import type { ResultItem } from '@/components/upload/RouteBuilder'
import { saveResultItemToGuide, resultItemToMap3DProps, defaultTitleForResultItem } from '@/lib/routeBuilder/importResultItem'
import { defaultPendingExpiresAt } from '@/components/upload/sharedHelpers'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'

// Stesso pattern di components/upload/RouteBuilder.tsx: MapLibre GL è client-only.
const RouteMap3D = dynamic(() => import('@/components/RouteMap3D'), { ssr: false })

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
 * originale, SENZA nessuna nuova chiamata Overpass/DTM: è un archivio, non una nuova ricerca. Da qui
 * si può però creare una Guida vera da uno di questi risultati (vedi handleCreateGuide) — prima
 * l'archivio era di sola lettura.
 */
export default function RicercaSalvataDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [search, setSearch] = useState<SearchHistoryDetail | null>(null)
  const [error, setError] = useState('')
  const [show3D, setShow3D] = useState<ResultItem | null>(null)
  const [creatingKey, setCreatingKey] = useState<string | null>(null)
  const [createError, setCreateError] = useState('')

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

  async function handleCreateGuide(item: ResultItem, i: number) {
    if (creatingKey) return
    const key = `${item.kind}-${i}`
    setCreatingKey(key)
    setCreateError('')
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = await saveResultItemToGuide(item, defaultTitleForResultItem(item, i), '', pendingExpiresAt)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setCreateError(`Creazione della guida non riuscita: ${e instanceof Error ? e.message : String(e)}`)
      setCreatingKey(null)
    }
  }

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

            {createError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{createError}</div>}

            <div className="space-y-3">
              {search.results.map((item, i) => {
                const key = `${item.kind}-${i}`
                const onChoose = () => handleCreateGuide(item, i)
                const onOpen3D = () => setShow3D(item)
                return item.kind === 'found'
                  ? <FoundRouteCard key={key} data={item.data} onChoose={onChoose} onOpen3D={onOpen3D} />
                  : <BuiltRouteCard key={key} data={item.data} onChoose={onChoose} onOpen3D={onOpen3D} />
              })}
            </div>
            {creatingKey && (
              <div className="fixed inset-0 z-[250] bg-black/40 flex items-center justify-center">
                <div className="bg-white rounded-2xl px-6 py-5 flex items-center gap-3 shadow-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-forest-600" />
                  <span className="text-sm font-medium text-stone-700">Creo la guida…</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {show3D && (
        <RouteMap3D {...resultItemToMap3DProps(show3D)} onClose={() => setShow3D(null)} />
      )}
    </div>
  )
}
