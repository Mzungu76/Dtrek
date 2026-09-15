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
import { formatPublicDate } from '@/lib/privacy/formatPublicDate'
import type { DiaryPublicSections } from '@/lib/diaryConfig'
import { MonthBarChart } from '@/components/diario/MonthBarChart'
import { AllRoutesMap, AllRoutesLegend } from '@/app/leggi/d/[token]/AllRoutesMap'
import { PublicPdfExport } from '@/app/leggi/d/[token]/PublicPdfExport'
import { PublicReportPage } from './PublicReportPage'

// Stesso foglio "di disegno" a 794px e stessa tecnica delle CSS Container Queries di
// PublicReportPage.tsx — il Sommario è la prima pagina dello stesso libro, deve avere la stessa
// identità di foglio stampabile, non un layout a parte. Vedi il commento in cima a
// PublicReportPage.tsx per il perché di `cqw` invece di `transform: scale()`.
const PAGE_W = 794
function cq(px: number): string {
  return `${+(px / PAGE_W * 100).toFixed(3)}cqw`
}

function PageNav({ n, total, backHref, backLabel }: { n: number; total: number; backHref?: string; backLabel?: string }) {
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
        {/* backHref assente per un Diario da solo dopo l'unione con la copertina (nessuna pagina
            separata a cui tornare, la copertina è appena sopra il Sommario nello stesso scroll) —
            presente solo per un Volume dentro una Raccolta, dove serve davvero risalire alla
            Raccolta (app/leggi/c/[token]/v/[vi]/libro). */}
        {backHref && (
          <a href={backHref} title={backLabel} className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{backLabel}</span>
          </a>
        )}
      </div>
      <a href={n < total ? `#p-${n + 1}` : undefined} aria-disabled={n === total}
        className={`flex items-center gap-1 text-xs font-semibold shrink-0 ${n === total ? 'invisible' : 'text-stone-500 hover:text-forest-700 transition'}`}>
        Successiva <ChevronRight className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

export function DiaryBook({ entries, show, title, subtitle, ownerName, dateRangeLabel, totalKm, totalElevationGain, pdfUrl, backHref, backLabel, hideExactDates = false, compactSummary = false }: {
  entries: PublicDiaryEntry[]
  show: DiaryPublicSections
  title: string
  subtitle?: string | null
  ownerName: string
  dateRangeLabel?: string
  totalKm: number
  totalElevationGain: number
  pdfUrl?: string | null
  /** Dove porta "torna ai Diari"/"torna al Diario" — assente per un Diario da solo (nessuna
   *  copertina separata a cui tornare dopo l'unione, vedi `compactSummary`); presente solo per un
   *  Volume dentro una Raccolta, che torna davvero alla Raccolta. */
  backHref?: string
  backLabel?: string
  /** Preferenza di privacy dell'autore (lib/sharePublicDiary.ts) — solo mese/anno invece della data
   *  esatta, nel Sommario e su ogni pagina di escursione. */
  hideExactDates?: boolean
  /** Il Diario da solo (app/leggi/d/[token]/page.tsx) mostra PublicCover appena sopra questo
   *  componente, con già titolo/sottotitolo/autore e questi stessi tre numeri — ripeterli qui
   *  sarebbe la stessa card duplicata due volte nella stessa pagina. Con `compactSummary` il
   *  Sommario salta quel blocco e comincia direttamente dall'Andamento mensile (unico contenuto
   *  della copertina che PublicCover non mostra). Un Volume di Raccolta (che ha la propria
   *  copertina identica un livello sopra) userà lo stesso compattamento in un giro successivo — qui
   *  resta false per non toccare quella pagina in questo cambiamento. */
  compactSummary?: boolean
}) {
  const totalPages = entries.length + 1
  const stats = show.statistiche ? computePublicDiaryStats(entries) : null

  return (
    <div className="bg-stone-100">
      {/* Pagina 1 — Sommario, lo stesso foglio A4/rivista delle pagine di escursione (e del
          Sommario del libro privato, components/diario/DiarioIndice.tsx): non un layout a sé. */}
      <section id="p-1">
        <PageNav n={1} total={totalPages} backHref={backHref} backLabel={backLabel} />
        <div className="bg-stone-200 px-2.5 sm:px-4 py-4">
          <div className="mx-auto bg-white overflow-hidden" style={{
            containerType: 'inline-size', width: 'min(100%, 1070px)',
            boxShadow: '0 8px 56px rgba(0,0,0,0.22)', borderRadius: cq(3),
          }}>
            <div style={{ padding: `${cq(72)} ${cq(64)}` }}>
              {/* compactSummary: il Diario da solo (app/leggi/d/[token]/DiaryPublicView.tsx) mostra
                  PublicCover appena sopra, con già titolo/sottotitolo/autore e questi stessi tre
                  numeri — ripeterli qui sarebbe la stessa card duplicata due volte nella stessa
                  pagina, quindi il Sommario salta quel blocco e comincia dall'Andamento mensile. */}
              {!compactSummary && (
                <>
                  <p className="font-barlow" style={{ fontWeight: 700, fontSize: cq(9), letterSpacing: cq(4), color: '#e08d3c', textTransform: 'uppercase', margin: `0 0 ${cq(8)}` }}>
                    Sommario
                  </p>
                  <h1 className="font-display" style={{ fontWeight: 700, color: '#193b20', letterSpacing: cq(-0.5), fontSize: cq(32), margin: 0 }}>
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="font-lora" style={{ fontStyle: 'italic', color: '#978e7a', marginTop: cq(6), fontSize: cq(14) }}>{subtitle}</p>
                  )}
                  <p style={{ fontSize: cq(11), color: '#a9a18e', marginTop: cq(6) }}>
                    di {ownerName}{dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
                  </p>
                </>
              )}

              {stats && (
                <>
                  {!compactSummary && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: cq(10), marginTop: cq(28) }}>
                      {[
                        { value: String(entries.length), label: entries.length === 1 ? 'Escursione' : 'Escursioni' },
                        { value: `${totalKm.toFixed(0)} km`, label: 'Percorsi' },
                        { value: `${Math.round(totalElevationGain).toLocaleString('it')} m`, label: 'Dislivello +' },
                      ].map(s => (
                        <div key={s.label} style={{ background: '#f8f7f4', border: '1px solid #eeece5', borderRadius: cq(12), padding: `${cq(14)} ${cq(10)}`, textAlign: 'center' }}>
                          <div className="font-mono" style={{ fontWeight: 700, color: '#1c4724', lineHeight: 1.15, fontSize: cq(19) }}>{s.value}</div>
                          <div className="font-barlow" style={{ fontWeight: 700, color: '#a9a18e', textTransform: 'uppercase', letterSpacing: cq(1), marginTop: cq(4), fontSize: cq(9) }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {entries.length > 0 && (
                    <div style={{ background: '#f8f7f4', border: '1px solid #eeece5', borderRadius: cq(12), padding: `${cq(14)} ${cq(16)}`, marginTop: compactSummary ? 0 : cq(12) }}>
                      <p className="font-barlow" style={{ fontWeight: 700, letterSpacing: cq(3), color: '#a9a18e', textTransform: 'uppercase', marginBottom: cq(8), fontSize: cq(9) }}>Andamento mensile</p>
                      <MonthBarChart activities={entries} />
                    </div>
                  )}
                </>
              )}

              {show.percorso && entries.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #eeece5', borderRadius: cq(16), padding: `${cq(16)} ${cq(20)}`, marginTop: cq(12), boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <p className="font-barlow" style={{ fontWeight: 700, letterSpacing: cq(3), color: '#a9a18e', textTransform: 'uppercase', marginBottom: cq(10), fontSize: cq(9) }}>Tutti i percorsi</p>
                  <AllRoutesMap routes={entries.map(e => ({ id: e.id, title: e.title, polyline: e.polyline ?? [] }))} />
                  <AllRoutesLegend routes={entries.map(e => ({ id: e.id, title: e.title, polyline: e.polyline ?? [] }))} />
                </div>
              )}

              {/* Indice — stessa riga numerata del Sommario in app (DiarioIndice.tsx): niente più
                  miniature/estratti di testo, un elenco da rivista stampata. */}
              <p className="font-barlow" style={{ fontWeight: 900, fontSize: cq(8), letterSpacing: cq(3), color: '#a9a18e', textTransform: 'uppercase', margin: `${cq(36)} 0 ${cq(14)}`, paddingBottom: cq(9), borderBottom: `${cq(1.5)} solid #e08d3c` }}>
                Le escursioni
              </p>
              <div style={{ borderTop: '1px solid #eeece5' }}>
                {entries.map((e, i) => {
                  const dateLabel = formatPublicDate(e.startTime, hideExactDates)
                  return (
                    <a key={e.id} href={`#p-${i + 2}`} style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                      padding: `${cq(14)} 0`, borderBottom: '1px solid #eeece5', textDecoration: 'none', color: 'inherit',
                    }}>
                      <div style={{ display: 'flex', gap: cq(16), alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                        <span className="font-mono" style={{ color: '#a9a18e', fontWeight: 500, minWidth: cq(24), fontSize: cq(11) }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="font-display" style={{ fontWeight: 700, color: '#193b20', letterSpacing: cq(-0.2), fontSize: cq(15) }}>
                            {e.title}
                          </div>
                          {dateLabel && (
                            <div className="font-lora" style={{ fontStyle: 'italic', color: '#a9a18e', marginTop: cq(2), fontSize: cq(10) }}>{dateLabel}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: cq(12), color: '#73695c', flexShrink: 0, marginLeft: cq(16), fontSize: cq(10) }}>
                        {e.distanceMeters > 0 && <span>{(e.distanceMeters / 1000).toFixed(1)} km</span>}
                        {e.elevationGain > 0 && <span>{Math.round(e.elevationGain)} m D+</span>}
                      </div>
                    </a>
                  )
                })}
                {entries.length === 0 && (
                  <p className="font-lora" style={{ fontStyle: 'italic', color: '#a9a18e', textAlign: 'center', padding: `${cq(32)} 0`, fontSize: cq(13) }}>
                    Nessuna escursione pubblicata.
                  </p>
                )}
              </div>

              {pdfUrl && (
                <a href={withForcedDownload(pdfUrl, 'diario-dtrek.pdf')} download
                  className="font-display" style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: cq(8),
                    background: '#fff', border: '1px solid #dcd8cc', color: '#57534e', fontWeight: 700,
                    borderRadius: cq(16), marginTop: cq(20), textDecoration: 'none', fontSize: cq(13),
                    padding: `${cq(14)} 0`,
                  }}>
                  <Download style={{ width: cq(16), height: cq(16) }} /> Scarica il diario in PDF
                </a>
              )}
              <PublicPdfExport diary={{ entries, ownerName, title, subtitle: subtitle ?? '', coverUrl: null, dateRangeLabel }} />
            </div>
          </div>
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
