'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ExternalLink, X, BookOpen } from 'lucide-react'
import { parseNoticeSource, type GuideNotice } from '@/lib/guideNotices'

const SEVERITY: Record<GuideNotice['severity'], { dot: string; chip: string; box: string; text: string; label: string }> = {
  danger:  { dot: '#dc2626', chip: 'bg-red-600/90 border-red-400/40',     box: 'border-red-200 bg-red-50',     text: 'text-red-900',   label: 'Critico' },
  warning: { dot: '#f59e0b', chip: 'bg-amber-500/90 border-amber-300/40', box: 'border-amber-200 bg-amber-50', text: 'text-amber-900', label: 'Attenzione' },
  info:    { dot: '#0ea5e9', chip: 'bg-sky-500/90 border-sky-300/40',     box: 'border-sky-200 bg-sky-50',     text: 'text-sky-900',   label: 'Nota' },
}

const SEVERITY_RANK: Record<GuideNotice['severity'], number> = { danger: 0, warning: 1, info: 2 }

interface Props {
  notices: GuideNotice[]
  /** Porta alla sezione "Verificato online" della guida, dove gli stessi avvisi stanno per esteso
   *  insieme alle fonti consultate. Assente ⇒ nessuna scorciatoia (il pannello resta comunque
   *  autosufficiente). */
  onOpenVerificato?: () => void
}

/**
 * Gli avvisi di percorso (chiusure, deviazioni, lavori: lib/guideNotices.ts) resi apribili dalla
 * copertina del percorso, senza dover prima aprire la guida.
 *
 * Perché una pillola accanto all'anello e non i puntini stessi come bersaglio del tocco:
 *  - i puntini sono grandi 4-6 px, molto sotto la soglia di un bersaglio tattile utilizzabile, e
 *    stanno su un anello che sul mobile è già stretto;
 *  - components/TrailScoreGaugeBadge.tsx è deliberatamente non interattivo e i suoi chiamanti lo
 *    avvolgono già in un `<button>` proprio (qui: "vai a Dati e sicurezza"), quindi un secondo
 *    bottone dentro l'SVG annidierebbe due elementi interattivi — HTML non valido, e sul tocco il
 *    bersaglio esterno vincerebbe comunque metà delle volte.
 *
 * Il pannello è un portale su document.body, non un popover posizionato sotto la pillola. Due
 * motivi, entrambi emersi da come si rompeva prima:
 *  - la pillola vive dentro TopOverlay, che ha il proprio `z-20` e quindi crea un contesto di
 *    impilamento: qualunque z-index interno resta confinato lì dentro, e la galleria in basso e la
 *    frase di sintesi — fratelli con z-index più alto — si disegnavano SOPRA il pannello;
 *  - ancorato alla pillola, che sta in alto sulla copertina, il pannello cresceva verso il basso
 *    fino a coprire mezza pagina su un telefono. Come foglio ancorato in basso invece si apre
 *    dove il pollice arriva, si ferma a metà schermo e scorre al suo interno.
 */
export default function CoverNoticesChip({ notices, onOpenVerificato }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Il foglio copre la pagina: lo scroll dietro di esso va bloccato, altrimenti scorrendo oltre la
  // fine dell'elenco si trascina la copertina sottostante.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (notices.length === 0) return null

  const sorted = [...notices].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const style = SEVERITY[sorted[0].severity]

  const sheet = (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center sm:justify-center"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(70vh, 34rem)' }}
      >
        {/* Maniglia: segnala che è un foglio trascinabile/chiudibile, come le altre sheet dell'app. */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="w-9 h-1 rounded-full bg-stone-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 shrink-0">
          <p className="text-[13px] font-bold text-stone-700">
            {notices.length === 1 ? 'Avviso sul percorso' : `Avvisi sul percorso (${notices.length})`}
          </p>
          <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700 p-1 -m-1" aria-label="Chiudi">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3.5 space-y-2.5">
          {sorted.map((notice, i) => {
            const st = SEVERITY[notice.severity]
            const { text, url } = parseNoticeSource(notice.text)
            return (
              <div key={i} className={`rounded-xl border px-3.5 py-3 ${st.box}`}>
                <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: st.dot }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.dot }} />
                  {st.label}
                </p>
                <p className={`text-[12.5px] leading-snug ${st.text}`}>{text}</p>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Fonte
                  </a>
                )}
              </div>
            )
          })}
        </div>

        {onOpenVerificato && (
          <button
            onClick={() => { setOpen(false); onOpenVerificato() }}
            className="shrink-0 w-full flex items-center justify-center gap-1.5 px-5 py-3.5 border-t border-stone-100 text-[12px] font-semibold text-stone-600 hover:bg-stone-50 transition-colors pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] sm:pb-3.5"
          >
            <BookOpen className="w-3.5 h-3.5" /> Leggi tutto in &ldquo;Verificato online&rdquo;
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Avvisi trovati online su questo percorso"
        className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md text-[11px] font-bold text-white shadow-sm transition-colors ${style.chip}`}
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        {notices.length === 1 ? '1 avviso sul percorso' : `${notices.length} avvisi sul percorso`}
      </button>
      {open && mounted && createPortal(sheet, document.body)}
    </>
  )
}
