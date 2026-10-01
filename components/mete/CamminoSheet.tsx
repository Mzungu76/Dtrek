'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Globe, ChevronRight, ChevronLeft, List, X as XIcon } from 'lucide-react'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import type { CamminoDetail, CamminoTappaDetail } from '@/app/api/cammini/[id]/route'
import { META_TYPE_CONFIG } from '@/lib/metaTypes'

const cfg = META_TYPE_CONFIG.cammino
const CamminoIcon = cfg.icon

const SOURCE_LABEL = {
  official: 'Tappe ufficiali',
  mixed: 'Tappe in parte ufficiali',
  computed: 'Tappe calcolate da Dtrek',
} as const

function km(m: number): string {
  return `${(m / 1000).toFixed(m >= 100_000 ? 0 : 1)} km`
}

/**
 * Scheda di un Cammino come foglio dal BASSO (docs/piano-cammini.md, Fase 3) — non più un popup in
 * alto che copriva la mappa: due stati.
 *  - elenco: nome, lunghezza, origine delle tappe e l'elenco "da → a". Toccando una tappa…
 *  - tappa: …il foglio si riduce a una barra compatta ("Tappa 3 di 16", frecce ‹ ›, "Elenco") e la
 *    mappa mostra la tappa evidenziata a tutta altezza. Le frecce scorrono le tappe senza riaprire
 *    l'elenco.
 * Il foglio comunica la propria altezza al chiamante (`onInset`), che inquadra il tracciato nella
 * parte di mappa rimasta libera. Una tappa calcolata da noi lo dice; il dislivello compare solo
 * quando è stato calcolato dal DTM — mai uno zero al suo posto.
 */
export default function CamminoSheet({ item, focusedOrdinal, onFocusTappa, onClose, onInset }: {
  item: MetaSearchResultItem
  focusedOrdinal: number | null
  onFocusTappa: (tappa: CamminoTappaDetail | null) => void
  onClose: () => void
  /** Distanza in pixel dal bordo alto del foglio al fondo dello schermo (0 alla chiusura) — per
   *  inquadrare la mappa sopra di esso. */
  onInset: (px: number) => void
}) {
  const [detail, setDetail] = useState<CamminoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const stats = item.camminoStats
  const isRete = stats?.structure === 'rete'

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

  // Comunica l'altezza del foglio al chiamante (cambia con lo stato elenco/tappa e col caricamento).
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    // Distanza dal bordo alto del foglio al fondo dello schermo: comprende anche il menu dell'app sotto di esso.
    const report = () => onInset(Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top)))
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => { ro.disconnect(); onInset(0) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tornando all'elenco, la tappa appena guardata resta visibile.
  useEffect(() => {
    if (focusedOrdinal != null) return
    const active = listRef.current?.querySelector('[data-last-focused="true"]')
    if (active) (active as HTMLElement).scrollIntoView({ block: 'nearest' })
  }, [focusedOrdinal])

  const tappe = detail?.tappe ?? []
  const focusedIdx = focusedOrdinal != null ? tappe.findIndex(t => t.ordinal === focusedOrdinal) : -1
  const focused = focusedIdx >= 0 ? tappe[focusedIdx] : null
  const step = (delta: number) => {
    const next = tappe[focusedIdx + delta]
    if (next) onFocusTappa(next)
  }

  return (
    <div ref={sheetRef}
      className="fixed left-0 right-0 z-20 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,.16)] flex flex-col"
      // Appoggiato sopra il menu dell'app (h-14 + rientro per l'home indicator), non dietro di esso.
      style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))', maxHeight: focused ? '210px' : 'min(52vh, 480px)' }}>
      <div className="shrink-0 flex justify-center pt-2.5"><span className="w-9 h-1 rounded-full bg-stone-200" /></div>

      {/* Testata — sempre visibile: chi è il cammino, quanto è lungo, da dove vengono le tappe. */}
      <div className="shrink-0 flex items-start gap-3 px-4 pt-2.5 pb-2.5">
        <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: cfg.color }}>
          <CamminoIcon className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold text-stone-800 leading-tight truncate">{item.name}</p>
          {stats && (
            <p className="text-[11.5px] text-stone-500 mt-0.5 truncate">
              <span className="font-semibold text-stone-700">{km(stats.lengthM)}</span> · {stats.tappeCount} tappe · {SOURCE_LABEL[stats.tappeSource]}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Chiudi"
          className="w-8 h-8 shrink-0 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {loading && <div className="flex justify-center py-5"><Loader2 className="w-4 h-4 animate-spin text-stone-300" /></div>}
      {error && <p className="px-4 pb-4 text-xs text-red-600">{error}</p>}

      {/* Stato "tappa": barra compatta con le frecce, la mappa fa il resto. */}
      {focused && (
        <div className="shrink-0 px-4 pb-4">
          <div className="flex items-center gap-2 bg-stone-50 border border-stone-100 rounded-2xl p-2">
            <button onClick={() => step(-1)} disabled={focusedIdx <= 0} aria-label="Tappa precedente"
              className="w-10 h-10 shrink-0 rounded-full bg-white shadow-sm border border-stone-200 flex items-center justify-center text-stone-700 disabled:opacity-30 transition-opacity">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-amber-600">Tappa {focusedIdx + 1} di {tappe.length}</p>
              <p className="text-[13px] font-semibold text-stone-800 truncate">
                {focused.fromName ?? 'Partenza'} <ChevronRight className="inline w-3 h-3 text-stone-400 -mt-0.5" /> {focused.toName ?? 'Arrivo'}
              </p>
              <p className="text-[11px] text-stone-500">
                {km(focused.lengthM)}
                {focused.elevationGainM != null ? ` · +${Math.round(focused.elevationGainM)} m` : ''}
                {focused.source === 'computed' ? ' · calcolata' : ''}
                {focused.source === 'computed' && focused.endsAtAnchor === false ? ' · fine tappa in aperta campagna' : ''}
              </p>
            </div>
            <button onClick={() => step(1)} disabled={focusedIdx >= tappe.length - 1} aria-label="Tappa successiva"
              className="w-10 h-10 shrink-0 rounded-full bg-white shadow-sm border border-stone-200 flex items-center justify-center text-stone-700 disabled:opacity-30 transition-opacity">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button onClick={() => onFocusTappa(null)}
            className="mx-auto mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-stone-500 hover:text-stone-700 transition-colors">
            <List className="w-3.5 h-3.5" /> Tutte le tappe
          </button>
        </div>
      )}

      {/* Stato "elenco" */}
      {!focused && detail && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {item.description && <p className="text-xs text-stone-600 leading-relaxed mb-2.5">{item.description}</p>}
          {detail.officialUrl && (
            <a href={detail.officialUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-forest-700 hover:underline mb-2.5 truncate">
              <Globe className="w-3 h-3 shrink-0" /> {detail.officialUrl}
            </a>
          )}
          {isRete && (
            <p className="text-[11px] text-stone-500 mb-2">Una rete di percorsi: non si fa intera, si sceglie un tratto.</p>
          )}
          <p className="text-[10.5px] text-stone-400 mb-1.5">Tocca una tappa per vederla sulla mappa.</p>
          <ol ref={listRef} className="space-y-1.5 mb-3">
            {tappe.map((t, i) => (
              <li key={t.ordinal}>
                <button type="button" onClick={() => onFocusTappa(t)}
                  className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left bg-stone-50 hover:bg-stone-100 active:bg-stone-200 transition-colors">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-stone-800 text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
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
                  <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" disabled
            className="w-full text-center text-xs font-bold text-white bg-stone-300 rounded-full py-2.5 cursor-not-allowed">
            Crea guida — in arrivo
          </button>
          <p className="text-[10.5px] text-stone-400 text-center mt-1.5">Presto potrai scegliere le tappe, le date e creare la guida.</p>
        </div>
      )}
    </div>
  )
}
