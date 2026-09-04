'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_LIST_DIVIDER, FONT_HAND, HandDrawnFrame } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import { savePlanned } from '@/lib/plannedStore'
import { metaSearchResultToPlannedHike } from '@/lib/metaToPlannedHike'
import { metaCardStats } from '@/lib/metaCard'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import { SITE_TYPE_CONFIG, SITE_TYPES, type SiteType, type PlaceCategory } from '@/lib/metaTypes'
import { ITALIAN_REGIONS } from '@/lib/italianRegions'
import { ArrowLeft, Building2, Landmark, Loader2, MapPin, Search, X } from 'lucide-react'

type SearchMetaType = 'borgo_citta' | 'sito'

const PLACE_CATEGORY_OPTIONS: { id: PlaceCategory; label: string }[] = [
  { id: 'borgo', label: 'Borgo' },
  { id: 'citta', label: 'Città' },
]

/**
 * Cerca/crea una Meta Borgo-Città o Sito (piano §17/§25 — Blocco C/D già costruiti, mai
 * raggiungibili finora da uno schermo reale). Riusa /api/meta-search (searchBorghi/searchSiti,
 * lib/metaSearch) per la ricerca e metaSearchResultToPlannedHike + savePlanned per la creazione —
 * nessuna nuova logica di ricerca/creazione qui, solo la UI che mancava. 'sentiero' resta
 * volutamente fuori: quel flusso è /upload?tab=gpx, invariato (piano §48.3/§18).
 */
export default function CercaMetaPage() {
  const router = useRouter()
  const [metaType, setMetaType] = useState<SearchMetaType>('borgo_citta')
  const [queryText, setQueryText] = useState('')
  const [region, setRegion] = useState('')
  const [category, setCategory] = useState<string[]>([])
  const [results, setResults] = useState<MetaSearchResultItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricerca non riuscita')
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [metaType, queryText, region, category])

  // Ricerca iniziale (nessun filtro = sfoglia i risultati più rilevanti) e ogni volta che cambia
  // la tipologia — i filtri restano applicati solo al tap su "Cerca", per non rifare una richiesta
  // ad ogni tasto premuto nel campo testo.
  useEffect(() => {
    setCategory([])
    runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaType])

  async function handleSelect(item: MetaSearchResultItem) {
    if (creatingId) return
    setCreatingId(item.id)
    setCreateError(null)
    try {
      const hike = metaSearchResultToPlannedHike(item)
      await savePlanned(hike)
      router.push(`/guida/${encodeURIComponent(hike.id)}/prima_di_partire`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Impossibile creare la Meta — riprova.')
      setCreatingId(null)
    }
  }

  const categoryOptions = metaType === 'sito'
    ? SITE_TYPES.map(id => ({ id, label: SITE_TYPE_CONFIG[id].label }))
    : PLACE_CATEGORY_OPTIONS

  return (
    <div className={`min-h-screen md:pb-0 ${MOBILE_BOTTOMBAR_SPACER}`} style={{ background: TACCUINO_PAPER.base }}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #4A5A3F, #2E3A26)' }}>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(46,58,38,.15), rgba(46,58,38,.85))' }} />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          <Link href="/percorsi" className="inline-flex items-center gap-1.5 text-[#E9DAC3] text-[13px] font-semibold mb-1.5 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Mete
          </Link>
          <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
            Cerca una Meta
          </h1>
          <p className="text-white/75 text-[13px] mt-1">Un borgo, una città o un sito da visitare — senza traccia GPS.</p>
        </div>
      </div>

      <main className="max-w-[720px] mx-auto px-5 sm:px-8 py-6 sm:py-8">
        {/* Tipologia — scelta esplicita dell'utente (piano §48.11, mai dedotta). Sentiero non è
            un'opzione qui: quel flusso resta /upload?tab=gpx, invariato. */}
        <div className="flex gap-2 mb-4">
          {([
            { id: 'borgo_citta' as const, label: 'Borgo / Città', icon: Building2 },
            { id: 'sito' as const, label: 'Sito', icon: Landmark },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setMetaType(t.id)}
              className="relative flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-colors"
              style={metaType === t.id
                ? { background: TACCUINO_ACCENT[600], color: 'white' }
                : { background: TACCUINO_PAPER.card, color: TACCUINO_INK.handMuted, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} />
          <input
            value={queryText}
            onChange={e => setQueryText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
            placeholder={metaType === 'sito' ? 'cerca un museo, un castello, un sito…' : 'cerca un borgo o una città…'}
            className="w-full pl-8 pr-8 py-2 rounded-[3px] text-[14px] outline-none placeholder:text-[#8a9bab]"
            style={{ background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, fontFamily: FONT_HAND }}
          />
          {queryText && (
            <button onClick={() => setQueryText('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: TACCUINO_INK.handMuted }} aria-label="Cancella ricerca">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <HandDrawnFrame stroke={TACCUINO_PAPER.cardBorder} strokeWidth={1.5} rx={4} />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 mb-2">
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="shrink-0 px-3 py-1.5 rounded-full text-[13px] outline-none"
            style={{ fontFamily: FONT_HAND, background: TACCUINO_PAPER.card, color: TACCUINO_INK.typed, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
          >
            <option value="">Tutte le regioni</option>
            {ITALIAN_REGIONS.map(r => <option key={r.slug} value={r.name}>{r.name}</option>)}
          </select>
          {categoryOptions.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
              className="relative shrink-0 px-3 py-1.5 rounded-full text-[13px] transition-colors"
              style={category.includes(c.id)
                ? { fontFamily: FONT_HAND, fontWeight: 700, color: TACCUINO_INK.typed }
                : { fontFamily: FONT_HAND, background: 'transparent', color: TACCUINO_INK.handMuted, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
            >
              {category.includes(c.id) && <HandDrawnFrame stroke={TACCUINO_ACCENT[600]} strokeWidth={1.5} rx={50} />}
              {c.label}
            </button>
          ))}
        </div>

        <button
          onClick={runSearch}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold mb-6 transition-colors disabled:opacity-60"
          style={{ background: TACCUINO_INK.typed, color: 'white' }}
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Cerco…</> : <><Search className="w-4 h-4" /> Cerca</>}
        </button>

        {createError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">{createError}</p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">Impossibile cercare: {error}</p>
        )}

        {results === null && loading ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-6 h-6 animate-spin" /><span>Cerco…</span>
          </div>
        ) : results !== null && results.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: TACCUINO_INK.handMuted }}>Nessun risultato con questi filtri.</p>
        ) : results !== null ? (
          <div className="flex flex-col">
            {results.map(item => {
              const stats = metaCardStats(item)
              const isCreating = creatingId === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  disabled={!!creatingId}
                  className="flex items-start gap-3.5 py-3.5 px-2 -mx-2 text-left disabled:opacity-60"
                  style={{ borderBottom: TACCUINO_LIST_DIVIDER }}
                >
                  <div
                    className="w-[64px] h-[64px] shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
                    style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
                  >
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                      : (item.metaType === 'sito' ? <Landmark className="w-6 h-6" style={{ color: TACCUINO_PAPER.cardBorder }} /> : <Building2 className="w-6 h-6" style={{ color: TACCUINO_PAPER.cardBorder }} />)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 18, color: TACCUINO_INK.typed, lineHeight: 1.2 }}>{item.name}</p>
                    {(item.municipality || item.province || item.region) && (
                      <p className="flex items-center gap-1 truncate" style={{ fontFamily: FONT.lora, fontSize: 12, color: TACCUINO_INK.handMuted, marginTop: 2 }}>
                        <MapPin className="w-3 h-3 shrink-0" /> {[item.municipality, item.province, item.region].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {stats.length > 0 && (
                      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1.5" style={{ fontFamily: FONT.lora, fontSize: 11, color: TACCUINO_INK.handMuted }}>
                        {stats.map(s => <span key={s.key}>{s.label}: {s.value}</span>)}
                      </div>
                    )}
                    {item.description && (
                      <p className="line-clamp-2 mt-1" style={{ fontFamily: FONT.lora, fontSize: 12.5, color: TACCUINO_INK.handMuted }}>{item.description}</p>
                    )}
                  </div>
                  {isCreating && <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-1" style={{ color: TACCUINO_ACCENT[600] }} />}
                </button>
              )
            })}
          </div>
        ) : null}
      </main>
    </div>
  )
}
