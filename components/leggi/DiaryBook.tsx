// Il Diario come libro: Sommario più una pagina per escursione, in stile rivista — pari pari al
// libro privato (components/diario/DiarioReportPage.tsx), su richiesta esplicita dell'utente dopo
// aver visto quella schermata. Scroll VERTICALE, un documento continuo: ogni pagina ha il proprio
// numero stampato nella barra di navigazione, il Sommario linka ogni escursione con un'ancora
// (`#p-N`) e ci si può sempre spostare a Precedente/Successiva/Sommario/indietro.
//
// Zero JavaScript: le ancore sono `<a href="#p-N">` vere, il browser ci salta da solo. Niente
// scroll-snap qui (era per la versione orizzontale, superata) — un documento verticale normale.
import { Download, BookOpen, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { withForcedDownload } from '@/lib/storageDownloadUrl'
import { type PublicDiaryEntry } from '@/lib/sharePublicDiary'
import { computePublicDiaryStats } from '@/lib/publicDiaryStats'
import type { DiaryPublicSections } from '@/lib/diaryConfig'
import { MonthBarChart } from '@/components/diario/MonthBarChart'
import { AllRoutesMap, AllRoutesLegend } from '@/app/leggi/d/[token]/AllRoutesMap'
import { PublicPdfExport } from '@/app/leggi/d/[token]/PublicPdfExport'
import { PublicReportPage } from './PublicReportPage'

function PageNav({ n, total, backHref, backLabel }: { n: number; total: number; backHref: string; backLabel: string }) {
  return (
    <div className="sticky top-14 z-10 bg-stone-50/95 backdrop-blur border-b border-stone-200 px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2">
      <a href={n > 1 ? `#p-${n - 1}` : undefined} aria-disabled={n === 1}
        className={`flex items-center gap-1 text-xs font-semibold shrink-0 ${n === 1 ? 'invisible' : 'text-stone-500 hover:text-forest-700 transition'}`}>
        <ChevronLeft className="w-3.5 h-3.5" /> Precedente
      </a>
      <div className="flex items-center gap-3 shrink-0">
        <a href="#p-1" title="Sommario" className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
          <BookOpen className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sommario</span>
        </a>
        <span className="font-mono text-[11px] text-stone-400">Pagina {n} di {total}</span>
        <a href={backHref} title={backLabel} className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
          <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{backLabel}</span>
        </a>
      </div>
      <a href={n < total ? `#p-${n + 1}` : undefined} aria-disabled={n === total}
        className={`flex items-center gap-1 text-xs font-semibold shrink-0 ${n === total ? 'invisible' : 'text-stone-500 hover:text-forest-700 transition'}`}>
        Successiva <ChevronRight className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

export function DiaryBook({ entries, show, title, subtitle, ownerName, dateRangeLabel, totalKm, totalElevationGain, pdfUrl, backHref, backLabel }: {
  entries: PublicDiaryEntry[]
  show: DiaryPublicSections
  title: string
  subtitle?: string | null
  ownerName: string
  dateRangeLabel?: string
  totalKm: number
  totalElevationGain: number
  pdfUrl?: string | null
  /** Dove porta "torna ai Diari"/"torna al Diario" — la copertina del Diario/Volume da cui si è
   *  aperto il libro. */
  backHref: string
  backLabel: string
}) {
  const totalPages = entries.length + 1
  const stats = show.statistiche ? computePublicDiaryStats(entries) : null

  return (
    <div className="bg-stone-100">
      {/* Pagina 1 — Sommario */}
      <section id="p-1">
        <PageNav n={1} total={totalPages} backHref={backHref} backLabel={backLabel} />
        <div className="max-w-3xl mx-auto px-4 sm:px-5 py-6 pb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-forest-900">{title}</h1>
          {subtitle && <p className="font-lora italic text-stone-500 mt-1">{subtitle}</p>}
          <p className="text-xs text-stone-400 mt-1">di {ownerName}{dateRangeLabel ? ` · ${dateRangeLabel}` : ''}</p>

          {stats && (
            <>
              <div className="grid grid-cols-3 gap-3 mt-5">
                {[
                  { value: String(entries.length), label: entries.length === 1 ? 'Escursione' : 'Escursioni' },
                  { value: `${totalKm.toFixed(0)} km`, label: 'Percorsi' },
                  { value: `${Math.round(totalElevationGain).toLocaleString('it')} m`, label: 'Dislivello +' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-stone-200 px-3 py-4 text-center shadow-sm">
                    <div className="font-mono text-xl font-bold text-forest-800 leading-tight">{s.value}</div>
                    <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
              {entries.length > 0 && (
                <div className="bg-white rounded-2xl border border-stone-200 px-4 py-3.5 shadow-sm mt-3">
                  <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-stone-400 mb-2">Andamento mensile</p>
                  <MonthBarChart activities={entries} />
                </div>
              )}
            </>
          )}

          {show.percorso && entries.length > 0 && (
            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-4 sm:p-5 mt-3">
              <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-stone-400 mb-2.5">Tutti i percorsi</p>
              <AllRoutesMap routes={entries.map(e => ({ id: e.id, title: e.title, polyline: e.polyline ?? [] }))} />
              <AllRoutesLegend routes={entries.map(e => ({ id: e.id, title: e.title, polyline: e.polyline ?? [] }))} />
            </div>
          )}

          <h2 className="font-display text-xl font-bold text-forest-900 mt-6 mb-3">Indice</h2>
          <div className="flex flex-col gap-1.5">
            {entries.map((e, i) => (
              <a key={e.id} href={`#p-${i + 2}`}
                className="group flex items-center gap-3 bg-white rounded-xl border border-stone-200 px-4 py-3 hover:border-stone-300 hover:shadow-sm transition">
                <span className="font-mono text-xs text-stone-400 w-14 shrink-0">Pag. {i + 2}</span>
                <span className="flex-1 min-w-0 font-display font-bold text-forest-900 truncate">{e.title}</span>
                <span className="font-mono text-[11px] text-stone-400 shrink-0">
                  {(e.distanceMeters / 1000).toFixed(1)} km
                </span>
              </a>
            ))}
            {entries.length === 0 && (
              <p className="text-sm text-stone-400 text-center py-8">Nessuna escursione pubblicata.</p>
            )}
          </div>

          {pdfUrl && (
            <a href={withForcedDownload(pdfUrl, 'diario-dtrek.pdf')} download
              className="flex items-center justify-center gap-2 bg-white border border-stone-200 hover:bg-stone-50 transition text-stone-600 font-display font-bold text-sm rounded-2xl py-3.5 shadow-sm mt-5">
              <Download className="w-4 h-4" /> Scarica il diario in PDF
            </a>
          )}
          <PublicPdfExport diary={{ entries, ownerName, title, subtitle: subtitle ?? '', coverUrl: null, dateRangeLabel }} />
        </div>
      </section>

      {/* Una pagina per escursione, in stile rivista */}
      {entries.map((e, i) => (
        <section key={e.id} id={`p-${i + 2}`}>
          <PageNav n={i + 2} total={totalPages} backHref={backHref} backLabel={backLabel} />
          <div className="py-6">
            <PublicReportPage entry={e} n={i + 1} show={show} />
          </div>
        </section>
      ))}
    </div>
  )
}
