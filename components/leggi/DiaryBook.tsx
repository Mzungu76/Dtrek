// Il Diario come libro: Sommario più una pagina per escursione, in stile rivista — pari pari al
// libro privato (components/diario/DiarioReportPage.tsx), su richiesta esplicita dell'utente dopo
// aver visto quella schermata. Scroll VERTICALE, un documento continuo: ogni pagina ha il proprio
// numero stampato nella barra di navigazione, il Sommario linka ogni escursione con un'ancora
// (`#p-N`) e ci si può sempre spostare a Precedente/Successiva/Sommario/indietro.
//
// Zero JavaScript: le ancore sono `<a href="#p-N">` vere, il browser ci salta da solo. Niente
// scroll-snap qui (era per la versione orizzontale, superata) — un documento verticale normale.
import { Download, BookOpen, ChevronLeft, ChevronRight, ArrowLeft, MapPin } from 'lucide-react'
import { withForcedDownload } from '@/lib/storageDownloadUrl'
import { type PublicDiaryEntry } from '@/lib/sharePublicDiary'
import { computePublicDiaryStats } from '@/lib/publicDiaryStats'
import { formatPublicDate } from '@/lib/privacy/formatPublicDate'
import { excerptFromContent } from '@/lib/publicExcerpt'
import type { DiaryPublicSections } from '@/lib/diaryConfig'
import { MonthBarChart } from '@/components/diario/MonthBarChart'
import { AllRoutesMap, AllRoutesLegend } from '@/app/leggi/d/[token]/AllRoutesMap'
import { PublicPdfExport } from '@/app/leggi/d/[token]/PublicPdfExport'
import { PublicReportPage } from './PublicReportPage'

/** Traccia ridotta a un piccolo schizzo (non un mosaico di tile: una manciata di pixel non
 *  giustifica il peso di richieste `/api/tile`), normalizzata nel riquadro `size×size`. */
function sketchPath(polyline: [number, number][], size = 56, pad = 6): string {
  const lats = polyline.map(p => p[0]), lons = polyline.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const spanLat = Math.max(maxLat - minLat, 1e-6)
  const spanLon = Math.max(maxLon - minLon, 1e-6)
  const scale = (size - 2 * pad) / Math.max(spanLat, spanLon)
  const offX = (size - spanLon * scale) / 2
  const offY = (size - spanLat * scale) / 2
  return polyline.map(([lat, lon], i) => {
    const x = offX + (lon - minLon) * scale
    const y = size - (offY + (lat - minLat) * scale) // la latitudine cresce verso l'alto, l'asse Y dell'SVG verso il basso
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

/** Miniatura di ogni riga del Sommario — foto di copertina, o in sua assenza uno schizzo del
 *  percorso, o in assenza di entrambi un segnaposto generico: mai un buco vuoto nella riga. */
function SommarioThumb({ entry, show }: { entry: PublicDiaryEntry; show: DiaryPublicSections }) {
  const photo = show.foto ? entry.photos[0] : undefined
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo.url} alt="" loading="lazy" decoding="async"
        className="w-14 h-14 rounded-lg object-cover shrink-0 border border-stone-200" />
    )
  }
  if (show.percorso && entry.polyline && entry.polyline.length > 1) {
    return (
      <div className="w-14 h-14 rounded-lg shrink-0 border border-stone-200 bg-forest-50 flex items-center justify-center">
        <svg viewBox="0 0 56 56" width={56} height={56} role="img" aria-label="Percorso">
          <path d={sketchPath(entry.polyline)} fill="none" stroke="#378d44" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  return (
    <div className="w-14 h-14 rounded-lg shrink-0 border border-stone-200 bg-stone-100 flex items-center justify-center">
      <MapPin className="w-5 h-5 text-stone-300" />
    </div>
  )
}

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

export function DiaryBook({ entries, show, title, subtitle, ownerName, dateRangeLabel, totalKm, totalElevationGain, pdfUrl, backHref, backLabel, hideExactDates = false }: {
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
  /** Preferenza di privacy dell'autore (lib/sharePublicDiary.ts) — solo mese/anno invece della data
   *  esatta, nel Sommario e su ogni pagina di escursione. */
  hideExactDates?: boolean
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
            {entries.map((e, i) => {
              const dateLabel = formatPublicDate(e.startTime, hideExactDates)
              const excerpt = show.racconto ? excerptFromContent(e.content) : ''
              return (
                <a key={e.id} href={`#p-${i + 2}`}
                  className="group flex items-center gap-3 bg-white rounded-xl border border-stone-200 px-4 py-3 hover:border-stone-300 hover:shadow-sm transition">
                  <SommarioThumb entry={e} show={show} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[10px] text-stone-400 shrink-0">Pag. {i + 2}</span>
                      <span className="font-display font-bold text-forest-900 truncate">{e.title}</span>
                    </div>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      {dateLabel}{e.distanceMeters > 0 && ` · ${(e.distanceMeters / 1000).toFixed(1)} km`}
                    </p>
                    {excerpt && (
                      <p className="font-lora italic text-[12px] text-stone-500 mt-1 truncate">{excerpt}</p>
                    )}
                  </div>
                </a>
              )
            })}
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
            <PublicReportPage entry={e} n={i + 1} show={show} hideExactDates={hideExactDates} />
          </div>
        </section>
      ))}

      {/* Un solo pulsante fisso per l'intero documento, non uno per pagina: `position: fixed` resta
          ancorato al viewport indipendentemente da dove si scorre, quindi basta un'istanza — dà
          accesso immediato al Sommario da qualunque punto del libro senza risalire pagina per
          pagina (es. dalla 59 alla 1). */}
      {entries.length > 0 && (
        <a href="#p-1" title="Torna al Sommario"
          className="fixed bottom-5 right-4 z-20 flex items-center gap-1.5 bg-forest-900 text-white text-xs font-semibold rounded-full pl-3 pr-4 py-2.5 shadow-lg hover:bg-forest-800 transition">
          <BookOpen className="w-3.5 h-3.5" /> Sommario
        </a>
      )}
    </div>
  )
}
