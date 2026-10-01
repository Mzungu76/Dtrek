'use client'
import { useEffect, useState } from 'react'
import { Loader2, Globe, Route as RouteIcon, ChevronRight } from 'lucide-react'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import type { CamminoDetail, CamminoTappaDetail } from '@/app/api/cammini/[id]/route'
import { META_TYPE_CONFIG } from '@/lib/metaTypes'

const cfg = META_TYPE_CONFIG.cammino

const SOURCE_LABEL = {
  official: 'Tappe ufficiali',
  mixed: 'Tappe in parte ufficiali',
  computed: 'Tappe calcolate da Dtrek',
} as const

function km(m: number): string {
  return `${(m / 1000).toFixed(m >= 100_000 ? 0 : 1)} km`
}

/**
 * Scheda di un Cammino (docs/piano-cammini.md, Fase 3): nome, lunghezza, numero e origine delle
 * tappe, elenco "da → a" con i chilometri. Toccando una tappa il chiamante la evidenzia sulla
 * mappa. Una tappa calcolata da noi lo dice (mai presentata come ufficiale); il dislivello compare
 * solo quando è stato calcolato dal DTM — mai uno zero al suo posto.
 */
export default function CamminoDetailCard({ item, focusedOrdinal, onFocusTappa }: {
  item: MetaSearchResultItem
  focusedOrdinal: number | null
  /** Evidenzia una tappa sulla mappa (null = nessuna, torna al cammino intero). */
  onFocusTappa: (tappa: CamminoTappaDetail | null) => void
}) {
  const [detail, setDetail] = useState<CamminoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const stats = item.camminoStats

  useEffect(() => {
    let cancelled = false
    setDetail(null); setLoading(true); setError(null)
    fetch(`/api/cammini/${encodeURIComponent(item.id)}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
        if (!cancelled) setDetail(data as CamminoDetail)
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Impossibile caricare il cammino') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [item.id])

  const isRete = stats?.structure === 'rete'

  return (
    <div>
      <div className="relative h-24" style={{ background: `linear-gradient(135deg, ${cfg.color}, #2E3A26)` }}>
        <RouteIcon className="absolute right-4 top-4 w-10 h-10 text-white/25" />
        <span className="absolute left-3 bottom-2.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {isRete ? 'Rete di cammini' : cfg.label}
        </span>
      </div>

      <div className="p-3.5">
        {item.region && <p className="text-[10px] text-stone-400 truncate mb-0.5">{item.region}</p>}
        <p className="font-display text-[15px] font-semibold text-stone-800 mb-1">{item.name}</p>
        {stats && (
          <p className="text-[12px] text-stone-600 mb-2.5">
            <span className="font-semibold">{km(stats.lengthM)}</span> · {stats.tappeCount} tappe · {SOURCE_LABEL[stats.tappeSource]}
          </p>
        )}
        {item.description && <p className="text-xs text-stone-600 leading-relaxed mb-2.5">{item.description}</p>}
        {detail?.officialUrl && (
          <a href={detail.officialUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-forest-700 hover:underline mb-2.5 truncate">
            <Globe className="w-3 h-3 shrink-0" /> {detail.officialUrl}
          </a>
        )}

        {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-stone-300" /></div>}
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        {detail && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-1.5">Tappe</p>
            {isRete && (
              <p className="text-[11px] text-stone-500 mb-2">
                Una rete di percorsi: non si fa intera, si sceglie un tratto.
              </p>
            )}
            <ol className="space-y-1.5 mb-3">
              {detail.tappe.map(t => {
                const active = focusedOrdinal === t.ordinal
                return (
                  <li key={t.ordinal}>
                    <button type="button" onClick={() => onFocusTappa(active ? null : t)}
                      className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${active ? 'bg-forest-50 ring-1 ring-forest-300' : 'bg-stone-50 hover:bg-stone-100'}`}>
                      <span className="w-6 h-6 shrink-0 rounded-full bg-stone-800 text-white text-[11px] font-bold flex items-center justify-center">{t.ordinal}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-stone-800 truncate">
                          {t.fromName ?? 'Partenza'} <ChevronRight className="inline w-3 h-3 text-stone-400 -mt-0.5" /> {t.toName ?? 'Arrivo'}
                        </span>
                        <span className="block text-[10.5px] text-stone-400">
                          {km(t.lengthM)}
                          {t.elevationGainM != null ? ` · +${Math.round(t.elevationGainM)} m` : ''}
                          {t.source === 'computed' ? ' · tappa calcolata' : ''}
                          {t.source === 'computed' && t.endsAtAnchor === false ? ' · fine tappa in aperta campagna' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </>
        )}

        <button type="button" disabled
          className="w-full text-center text-xs font-bold text-white bg-stone-300 rounded-full py-2.5 cursor-not-allowed">
          Crea guida — in arrivo
        </button>
        <p className="text-[10.5px] text-stone-400 text-center mt-1.5">
          Presto potrai scegliere le tappe, le date e creare la guida.
        </p>
      </div>
    </div>
  )
}
