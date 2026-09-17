'use client'
import { useCallback, useEffect, useState } from 'react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import { SITE_TYPE_CONFIG, SITE_TYPES, type PlaceCategory, type SiteType } from '@/lib/metaTypes'
import { ITALIAN_REGIONS } from '@/lib/italianRegions'
import { Building2, Landmark, Loader2, MapPin, Search, X } from 'lucide-react'

type SearchMetaType = 'borgo_citta' | 'sito'

const PLACE_CATEGORY_OPTIONS: { id: PlaceCategory; label: string }[] = [
  { id: 'borgo', label: 'Borgo' },
  { id: 'citta', label: 'Città' },
]

/**
 * Pagina di solo test per verificare che /api/meta-search (lib/metaSearch/searchBorghi.ts e
 * searchSiti.ts) trovi correttamente i borghi/città e i siti aggiunti di recente a dtrek_places.
 * Nessuna azione di creazione Meta né navigazione: mostra i risultati grezzi, compreso il punteggio
 * di ranking, per poter verificare a occhio che la ricerca risponda come atteso. Non collegata alla
 * revisione della pagina di ricerca definitiva (fuori scopo qui).
 */
export default function TestRicercaMetePage() {
  const [metaType, setMetaType] = useState<SearchMetaType>('borgo_citta')
  const [queryText, setQueryText] = useState('')
  const [region, setRegion] = useState('')
  const [category, setCategory] = useState<string[]>([])
  const [results, setResults] = useState<MetaSearchResultItem[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/meta-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaType,
          query: queryText.trim() || undefined,
          region: region || undefined,
          category: category.length > 0 ? category : undefined,
          limit: 30,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || data?.error || `Errore ${res.status}`)
      setResults(data.items as MetaSearchResultItem[])
      setTotal(typeof data.total === 'number' ? data.total : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricerca non riuscita')
      setResults(null)
      setTotal(null)
    } finally {
      setLoading(false)
    }
  }, [metaType, queryText, region, category])

  // Ricerca iniziale e ogni volta che cambia la tipologia (i filtri category/region non hanno più
  // senso passando da un tipo all'altro, es. categorie Sito su un Borgo).
  useEffect(() => {
    setCategory([])
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaType])

  const categoryOptions = metaType === 'sito'
    ? SITE_TYPES.map(id => ({ id, label: SITE_TYPE_CONFIG[id].label }))
    : PLACE_CATEGORY_OPTIONS

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <main className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 sm:py-8">
        <BackLink fallbackHref="/profilo" label="Profilo" className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 mb-2 transition-colors" />
        <h1 className="font-display text-2xl font-semibold text-stone-800 mb-1">Test ricerca Borghi/Città e Siti</h1>
        <p className="text-stone-500 text-sm mb-6">
          Pagina temporanea per verificare che l&apos;archivio ampliato risponda alla ricerca — chiama
          direttamente <code className="text-xs bg-stone-100 px-1 py-0.5 rounded">/api/meta-search</code>.
        </p>

        <div className="flex gap-2 mb-4">
          {([
            { id: 'borgo_citta' as const, label: 'Borgo / Città', icon: Building2 },
            { id: 'sito' as const, label: 'Sito', icon: Landmark },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setMetaType(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                metaType === t.id ? 'bg-forest-600 text-white' : 'bg-white text-stone-500 border border-stone-200 hover:border-forest-300'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={queryText}
            onChange={e => setQueryText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
            placeholder={metaType === 'sito' ? 'cerca un museo, un castello, un sito…' : 'cerca un borgo o una città…'}
            className="w-full pl-8 pr-8 py-2 rounded-xl text-sm outline-none border border-stone-200 focus:border-forest-400 placeholder:text-stone-400"
          />
          {queryText && (
            <button onClick={() => setQueryText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" aria-label="Cancella ricerca">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 mb-2">
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="shrink-0 px-3 py-1.5 rounded-full text-sm outline-none border border-stone-200 bg-white text-stone-600"
          >
            <option value="">Tutte le regioni</option>
            {ITALIAN_REGIONS.map(r => <option key={r.slug} value={r.name}>{r.name}</option>)}
          </select>
          {categoryOptions.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors border ${
                category.includes(c.id) ? 'bg-forest-600 text-white border-forest-600 font-semibold' : 'bg-white text-stone-500 border-stone-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          onClick={runSearch}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold mb-6 bg-stone-800 text-white disabled:opacity-60"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Cerco…</> : <><Search className="w-4 h-4" /> Cerca</>}
        </button>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">Impossibile cercare: {error}</p>
        )}

        {results !== null && !error && (
          <p className="text-xs text-stone-400 mb-3">
            {results.length} risultati mostrati{total !== null && total > results.length ? ` (${total} totali)` : ''}
          </p>
        )}

        {results === null && loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-stone-400">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Cerco…</span>
          </div>
        ) : results !== null && results.length === 0 ? (
          <p className="text-sm text-center py-12 text-stone-400">Nessun risultato con questi filtri.</p>
        ) : results !== null ? (
          <div className="flex flex-col gap-2">
            {results.map(item => (
              <div key={item.id} className="flex items-start gap-3.5 p-3.5 bg-white rounded-xl border border-stone-200">
                <div className="w-[56px] h-[56px] shrink-0 rounded-lg overflow-hidden flex items-center justify-center bg-stone-50 border border-stone-100">
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                    : (item.metaType === 'sito' ? <Landmark className="w-5 h-5 text-stone-300" /> : <Building2 className="w-5 h-5 text-stone-300" />)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-800 leading-tight">{item.name}</p>
                  {(item.municipality || item.province || item.region) && (
                    <p className="flex items-center gap-1 text-xs text-stone-400 truncate mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" /> {[item.municipality, item.province, item.region].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {item.siteType && (
                    <p className="text-xs text-stone-400 mt-0.5">{SITE_TYPE_CONFIG[item.siteType as SiteType].label}</p>
                  )}
                  {item.description && (
                    <p className="text-xs text-stone-500 line-clamp-2 mt-1">{item.description}</p>
                  )}
                  <p className="text-[11px] text-stone-400 mt-1.5 font-mono">
                    score {item.rankingScore.toFixed(2)} · fonti {item.sourceCount} · confidenza {item.confidence.toFixed(2)}
                    {item.distanceKm !== undefined ? ` · ${item.distanceKm.toFixed(1)} km` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  )
}
