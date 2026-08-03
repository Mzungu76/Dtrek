'use client'
import { useState } from 'react'
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
   *  insieme alle fonti consultate. Assente ⇒ nessuna scorciatoia (il popup resta comunque
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
 * I puntini restano il segnale visivo che c'è qualcosa da sapere; questa pillola, subito sotto,
 * è ciò che si tocca per leggerlo. Il conteggio è nel testo, quindi il segnale non dipende dal
 * riuscire a contare dei puntini colorati.
 */
export default function CoverNoticesChip({ notices, onOpenVerificato }: Props) {
  const [open, setOpen] = useState(false)
  if (notices.length === 0) return null

  const sorted = [...notices].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const worst = sorted[0].severity
  const style = SEVERITY[worst]

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        title="Avvisi trovati online su questo percorso"
        className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md text-[11px] font-bold text-white shadow-sm transition-colors ${style.chip}`}
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        {notices.length === 1 ? '1 avviso sul percorso' : `${notices.length} avvisi sul percorso`}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-8 z-[61] w-[min(20rem,calc(100vw-3rem))] rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-stone-100">
              <p className="text-[12px] font-bold text-stone-700">Avvisi sul percorso</p>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700" aria-label="Chiudi">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto px-3.5 py-3 space-y-2">
              {sorted.map((notice, i) => {
                const st = SEVERITY[notice.severity]
                const { text, url } = parseNoticeSource(notice.text)
                return (
                  <div key={i} className={`rounded-xl border px-3 py-2.5 ${st.box}`}>
                    <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wide mb-1" style={{ color: st.dot }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: st.dot }} />
                      {st.label}
                    </p>
                    <p className={`text-[12px] leading-snug ${st.text}`}>{text}</p>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-stone-500 hover:text-stone-800 transition-colors"
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
                className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 border-t border-stone-100 text-[11.5px] font-semibold text-stone-600 hover:bg-stone-50 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" /> Leggi tutto in &ldquo;Verificato online&rdquo;
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
