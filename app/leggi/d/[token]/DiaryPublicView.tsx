// Home del sito pubblico del Diario.
//
// Prima era una pagina sola che conteneva tutto e si scorreva all'infinito: con dieci escursioni
// e cento foto diventava lunghissima e senza punti di riferimento. Ora è la home di un piccolo
// sito — copertina, numeri, indice — e ogni escursione ha una pagina propria
// (`/leggi/d/[token]/e/[n]`), raggiungibile dall'indice e con la sua navigazione.
//
// Direzione Taccuino Botanico (docs/siti-pubblici-taccuino-piano.md): carta e rilegatura invece
// della card bianca su `bg-stone-50` di prima.
//
// Fase 8 — copertina e Sommario riportati fedeli a `docs/mockup-siti-pubblici-diario/D_Apertura.
// dc.html`/`D_Sommario.dc.html` (segnalato dall'utente su schermo reale: "non ha nulla a che fare
// col mockup" — la prima versione teneva la copertina come una piccola card in cima alla pagina,
// non a piena pagina, e le righe dell'indice erano grandi card 16:9 invece delle righe compatte
// con icona del mockup). La copertina "che si apre al tocco" del mockup usa però un vero overlay
// (`position:absolute`/`fixed` a piena pagina, cerniera 3D) — esattamente il pattern che la Fase 7
// ha isolato come causa del bug "testo invisibile" (vedi lib/taccuinoTokens.tsx). Riprodurlo qui
// identico avrebbe rischiato di reintrodurlo sulle sezioni sotto (Numeri, indice). Sostituito con
// una tecnica equivalente ma sicura: la copertina resta nel FLUSSO NORMALE del documento (mai
// `absolute`/`fixed` a piena pagina) e si "apre" collassando la propria altezza a zero con una
// leggera rotazione 3D in dissolvenza — stesso effetto percepito (tocchi, la copertina sparisce,
// sotto c'è il Sommario), ottenuto senza un secondo layer che ricopre la pagina. Interazione
// pura CSS (checkbox nascosto + `peer-checked:`), zero JavaScript spedito al browser: resta un
// componente SERVER.
import { useId } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Download, Route as RouteIcon, ChevronRight, Trophy, Mountain } from 'lucide-react'
import { withForcedDownload } from '@/lib/storageDownloadUrl'
import { formatDuration } from '@/lib/tcxParser'
import { hasNarrative, type PublicDiary } from '@/lib/sharePublicDiary'
import { computePublicDiaryStats } from '@/lib/publicDiaryStats'
import { MonthBarChart } from '@/components/diario/MonthBarChart'
import { HandDrawnFrame } from '@/lib/taccuinoTokens'
import { AllRoutesMap, AllRoutesLegend } from './AllRoutesMap'
import { RouteSketch } from './RouteSketch'
import { PublicPdfExport } from './PublicPdfExport'
import { SiteHeader, DtrekCallout, SiteFooter, taccuinoPaperBackgroundStyle, TaccuinoSpineShadow } from './SiteChrome'

const COVER_GRADIENT = 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)'

export function DiaryPublicView({ diary, token, entryBasePath, headerHomeHref, headerHomeLabel }: {
  diary: PublicDiary
  token: string
  /** Dove puntano i link alle singole escursioni — `/leggi/d/[token]` di default; un Diario
   *  annidato in una Raccolta (`app/leggi/c/[token]/v/[v]/page.tsx`) passa il proprio prefisso. */
  entryBasePath?: string
  /** Dove porta il logo/la voce "home" della testata — di norma questo stesso Diario, ma per un
   *  Diario dentro una Raccolta punta all'indice della Raccolta (si "torna al cofanetto", non a
   *  un giro su se stessi). */
  headerHomeHref?: string
  headerHomeLabel?: string
}) {
  const show = diary.config.publicSections
  const entryBase = entryBasePath ?? `/leggi/d/${token}`
  const openId = useId()

  const stats: { value: string; label: string }[] = []
  if (diary.entries.length) stats.push({ value: String(diary.entries.length), label: diary.entries.length === 1 ? 'Escursione' : 'Escursioni' })
  if (diary.totalKm) stats.push({ value: diary.totalKm.toFixed(0), label: 'Km percorsi' })
  if (diary.totalElevationGain) stats.push({ value: Math.round(diary.totalElevationGain).toLocaleString('it'), label: 'M dislivello' })

  return (
    <div className="min-h-screen relative" style={taccuinoPaperBackgroundStyle()}>
      {/* Transizione cross-documento del browser (progressive enhancement, nessun JS) — l'altro
          lato è app/u/[slug]/page.tsx, che dichiara la stessa regola e lo stesso nome sulla propria
          copertina. Dove non supportata, la navigazione resta quella normale. */}
      <style>{'@view-transition { navigation: auto; }'}</style>
      <input type="checkbox" id={openId} className="peer hidden" />

      {/* COPERTINA — a piena pagina come nel mockup, ma nel flusso normale del documento (mai un
          overlay `absolute`/`fixed`): collassa in altezza invece di scorrere via da sopra. */}
      <label htmlFor={openId} aria-hidden="true"
        className="block h-[100dvh] max-h-[100dvh] origin-top overflow-hidden cursor-pointer relative text-white transition-[max-height,opacity] duration-700 ease-[cubic-bezier(.5,0,.2,1)] peer-checked:max-h-0 peer-checked:opacity-0 peer-checked:pointer-events-none peer-checked:duration-500"
        style={{ background: diary.config.coverUrl ? undefined : COVER_GRADIENT, viewTransitionName: 'diario-cover' }}>
        {diary.config.coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={diary.config.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(8,24,14,0.74) 0%, rgba(8,24,14,0.5) 60%, rgba(8,24,14,0.62) 100%)' }} />
          </>
        ) : (
          <>
            <svg aria-hidden="true" className="absolute inset-0 w-full h-full opacity-[0.045]" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
              <path d="M0,640 Q98,590 196,605 Q294,620 390,570 L390,844 L0,844 Z" fill="white" opacity=".6" />
              <path d="M0,565 Q88,515 186,530 Q284,545 390,498" stroke="white" strokeWidth=".8" fill="none" />
              <path d="M0,490 Q98,448 196,462 Q294,476 390,428" stroke="white" strokeWidth=".8" fill="none" />
              <path d="M0,415 Q108,375 196,388 Q294,401 390,355" stroke="white" strokeWidth=".7" fill="none" />
              <path d="M0,340 Q108,300 196,313 Q294,326 390,280" stroke="white" strokeWidth=".6" fill="none" />
            </svg>
            <svg aria-hidden="true" className="absolute bottom-0 left-0 w-full opacity-[0.09]" viewBox="0 0 390 240" preserveAspectRatio="none">
              <path d="M0,240 L34,158 L64,190 L110,92 L150,132 L189,42 L221,92 L255,52 L292,96 L324,60 L358,88 L390,65 L390,240 Z" fill="white" />
            </svg>
            <div aria-hidden="true" className="absolute top-16 right-3 font-display font-bold leading-none select-none text-[150px] text-white/[0.025]">I</div>
          </>
        )}

        {/* Contenuto vero, in un'unica colonna flex a piena altezza — niente più coordinate
            assolute indovinate per il blocco titolo: si adatta da solo a qualunque altezza di
            schermo invece di dover indovinare un `bottom` fisso per il mobile e uno per desktop. */}
        <div className="relative h-full flex flex-col p-6 sm:p-10">
          <div className="flex items-center justify-between">
            <span className="font-barlow font-black text-sm tracking-[0.3em] uppercase" style={{ color: '#e08d3c' }}>DTrek</span>
            <span className="text-[8px] tracking-[0.18em] uppercase text-white/30">Diario di Escursioni</span>
          </div>

          <div className="mt-auto pr-3">
            {diary.dateRangeLabel && (
              <p className="font-barlow font-bold text-[11px] tracking-[0.26em] uppercase mb-3.5" style={{ color: '#e08d3c' }}>
                {diary.dateRangeLabel}
              </p>
            )}
            <h1 className="font-display font-bold text-4xl sm:text-5xl leading-[1.06] tracking-tight mb-4">{diary.config.title}</h1>
            <div className="w-12 h-0.5 mb-4" style={{ background: '#e08d3c' }} />
            {diary.config.subtitle && <p className="font-lora italic text-white/60 text-sm mb-6">{diary.config.subtitle}</p>}
            {stats.length > 0 && (
              <div className="flex border-t border-white/10 pt-4">
                {stats.map((s, i) => (
                  <div key={s.label} className={`flex-1 ${i > 0 ? 'border-l border-white/10 pl-4' : ''} ${i < stats.length - 1 ? 'pr-4' : ''}`}>
                    <p className="font-mono text-xl text-white leading-none">{s.value}</p>
                    <p className="text-[8px] tracking-[0.2em] uppercase text-white/40 mt-1.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-center animate-pulse pt-10 pb-2">
            <span className="font-barlow font-bold text-[10.5px] tracking-[0.2em] uppercase text-white/60">Tocca per aprire</span>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-[9px] tracking-[0.24em] uppercase text-white/40">{diary.ownerName}</p>
            <p className="font-lora italic text-[9px] text-white/20">Fatto con DTrek</p>
          </div>
        </div>
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: '#e08d3c' }} />
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px]" style={{ background: 'linear-gradient(90deg,#e08d3c 0%,#d97220 55%,transparent 100%)' }} />
      </label>

      <TaccuinoSpineShadow />
      <SiteHeader homeHref={headerHomeHref ?? `/leggi/d/${token}`} homeLabel={headerHomeLabel} title={diary.config.title} current="home" />

      {/* Pillola per richiudere il taccuino — nel flusso normale, appare (`peer-checked:flex`)
          solo a copertina aperta, non un overlay sopra il resto della pagina. */}
      <div className="hidden peer-checked:flex justify-end max-w-4xl mx-auto px-4 sm:px-5 pl-[calc(1rem+34px)] sm:pl-[calc(1.25rem+34px)] pt-3">
        <label htmlFor={openId} className="inline-flex items-center gap-1.5 bg-[#2E2A22] text-white text-xs font-bold rounded-full px-4 py-2 cursor-pointer shadow-md hover:bg-[#232019] transition">
          ↩ Chiudi il taccuino
        </label>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 pl-[calc(1rem+34px)] sm:pl-[calc(1.25rem+34px)] space-y-5">
        {/* Intestazione del Sommario — eyebrow + titolo scritto "a mano" (D_Sommario.dc.html):
            diverso di proposito dal Playfair della copertina, lo stesso contrasto stampato/a mano
            di tutto il resto del taccuino (vedi INK_ABSORB_STYLE in lib/taccuinoTokens.tsx). */}
        <div>
          <p className="font-barlow font-bold text-[9.5px] tracking-[0.2em] uppercase text-[#95886A] mb-0.5">Sommario · DTrek</p>
          <h2 className="font-hand text-[32px] leading-none text-[#2E2A22]/[0.82]" style={{ mixBlendMode: 'multiply' }}>
            {diary.config.title}
          </h2>
        </div>

        {/* Numeri */}
        {show.statistiche && (() => {
          const pageStats = computePublicDiaryStats(diary.entries)
          return (
            <section className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: String(diary.entries.length), label: diary.entries.length === 1 ? 'Escursione' : 'Escursioni' },
                  { value: `${diary.totalKm.toFixed(0)} km`, label: 'Percorsi' },
                  { value: `${Math.round(diary.totalElevationGain).toLocaleString('it')} m`, label: 'Dislivello +' },
                ].map(s => (
                  <div key={s.label} className="bg-[#EBE0C8] rounded-2xl border border-[#D9C9A8] px-3 py-4 text-center shadow-sm">
                    <div className="font-mono text-xl sm:text-2xl font-bold text-[#2E2A22] leading-tight">{s.value}</div>
                    <div className="text-[10px] font-semibold text-[#95886A] uppercase tracking-wider mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {diary.entries.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#EBE0C8] rounded-2xl border border-[#D9C9A8] px-4 py-3 shadow-sm flex items-center gap-2.5">
                    <Trophy className="w-4 h-4 text-[#C0603D] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold text-[#2E2A22]">{pageStats.longestKm.toFixed(1)} km</div>
                      <div className="text-[10px] text-[#95886A] truncate">Più lunga{pageStats.longestTitle ? ` · ${pageStats.longestTitle}` : ''}</div>
                    </div>
                  </div>
                  <div className="bg-[#EBE0C8] rounded-2xl border border-[#D9C9A8] px-4 py-3 shadow-sm flex items-center gap-2.5">
                    <Mountain className="w-4 h-4 text-[#C0603D] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold text-[#2E2A22]">{Math.round(pageStats.highestAlt)} m</div>
                      <div className="text-[10px] text-[#95886A] truncate">Quota max{pageStats.highestTitle ? ` · ${pageStats.highestTitle}` : ''}</div>
                    </div>
                  </div>
                </div>
              )}

              {pageStats.years.length > 1 && (
                <div className="bg-[#EBE0C8] rounded-2xl border border-[#D9C9A8] px-4 py-3.5 shadow-sm overflow-x-auto">
                  <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-[#95886A] mb-2">Anno per anno</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#95886A] uppercase text-[9px] tracking-wide">
                        <th className="text-left font-semibold py-1">Anno</th>
                        <th className="text-right font-semibold py-1">Escursioni</th>
                        <th className="text-right font-semibold py-1">Distanza</th>
                        <th className="text-right font-semibold py-1">Dislivello</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageStats.years.map(y => (
                        <tr key={y.year} className="border-t border-[#D9C9A8]/60 text-[#2E2A22]">
                          <td className="py-1.5 font-bold">{y.year}</td>
                          <td className="py-1.5 text-right">{y.count}</td>
                          <td className="py-1.5 text-right font-mono">{y.km.toFixed(0)} km</td>
                          <td className="py-1.5 text-right font-mono">{Math.round(y.elevGain).toLocaleString('it')} m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {diary.entries.length > 0 && (
                <div className="bg-[#EBE0C8] rounded-2xl border border-[#D9C9A8] px-4 py-3.5 shadow-sm">
                  <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-[#95886A] mb-2">Andamento mensile</p>
                  <MonthBarChart activities={diary.entries} />
                </div>
              )}
            </section>
          )
        })()}

        {/* Tutti i percorsi su una mappa */}
        {show.percorso && diary.entries.length > 0 && (
          <section className="bg-[#EBE0C8] rounded-3xl border border-[#D9C9A8] shadow-sm p-4 sm:p-5">
            <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-[#95886A] mb-2.5">
              Tutti i percorsi
            </p>
            <AllRoutesMap routes={diary.entries.map(e => ({ id: e.id, title: e.title, polyline: e.polyline ?? [] }))} />
            <AllRoutesLegend routes={diary.entries.map(e => ({ id: e.id, title: e.title, polyline: e.polyline ?? [] }))} />
          </section>
        )}

        {/* Indice raggruppato per anno: con più annate un elenco unico diventa un muro senza
            riferimenti temporali, ed è la prima cosa che si cerca in un diario. Il numero
            dell'escursione resta quello globale, così coincide con il PDF. Righe compatte con
            icona (D_Sommario.dc.html) invece delle card 16:9 di prima: quel formato leggeva più
            come un feed di foto che come l'indice di un libro. */}
        {Array.from(
          diary.entries.reduce((m, e, i) => {
            const y = new Date(e.startTime).getFullYear()
            const list = m.get(y) ?? []
            list.push({ e, i })
            return m.set(y, list)
          }, new Map<number, { e: typeof diary.entries[number]; i: number }[]>()),
        ).sort((a, b) => b[0] - a[0]).map(([year, items]) => (
        <section key={year} className="space-y-2">
          <h2 className="flex items-baseline gap-3 px-1">
            <span className="font-display text-2xl font-bold text-[#2E2A22]">{year}</span>
            <span className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-[#95886A]">
              {items.length} {items.length === 1 ? 'escursione' : 'escursioni'} ·{' '}
              {(items.reduce((s, x) => s + x.e.distanceMeters, 0) / 1000).toFixed(0)} km
            </span>
          </h2>
          <div>
            {items.map(({ e, i }) => {
              const cover = show.foto ? e.photos[0] : undefined
              const hasStory = hasNarrative(e.content) && show.racconto
              return (
                <a key={e.id} href={`${entryBase}/e/${i + 1}`}
                  className="group flex items-center gap-3 px-2 py-2 rounded-xl transition hover:bg-[#EBE0C8]/50"
                  style={{ background: hasStory ? 'rgba(192,96,61,0.07)' : 'transparent' }}>
                  <div className="relative w-[60px] h-[60px] rounded-xl shrink-0 bg-[#EBE0C8] overflow-hidden">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                    ) : e.polyline && e.polyline.length > 1 ? (
                      <RouteSketch polyline={e.polyline} color="#C0603D" className="bg-transparent" width={60} height={60} showMarkers={false} animated />
                    ) : null}
                    <HandDrawnFrame stroke="#D9C9A8" rx={9} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-[13px] text-[#2E2A22] leading-tight truncate group-hover:text-[#193b20] transition">
                      {e.title}
                    </p>
                    <p className="font-mono text-[10px] text-[#95886A] mt-1">
                      {(e.distanceMeters / 1000).toFixed(1)} km · {Math.round(e.elevationGain)} m D+
                      {e.totalTimeSeconds > 0 && ` · ${formatDuration(e.totalTimeSeconds)}`}
                    </p>
                    <p className="text-[9px] font-barlow font-bold tracking-[0.15em] uppercase text-[#C0603D] mt-0.5">
                      #{String(i + 1).padStart(2, '0')} · {format(new Date(e.startTime), 'MMMM yyyy', { locale: it })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#C4BEAD] group-hover:text-[#C0603D] group-hover:translate-x-0.5 transition shrink-0" />
                </a>
              )
            })}
          </div>
        </section>
        ))}
        {diary.entries.length === 0 && (
          <p className="text-sm text-[#95886A] text-center py-8">Nessuna escursione pubblicata.</p>
        )}

        {/* Il PDF è un allegato: il sito si legge per intero senza scaricarlo. Quello caricato
            dall'autore (se c'è) resta il documento curato a mano; PublicPdfExport ne genera uno
            nuovo al volo, dal solo contenuto già pubblico, per chi non lo trova. */}
        {diary.pdfUrl && (
          <a href={withForcedDownload(diary.pdfUrl, 'diario-dtrek.pdf')} download
            className="flex items-center justify-center gap-2 bg-[#EBE0C8] border border-[#D9C9A8] hover:bg-[#e3d6b8] transition text-[#2E2A22] font-display font-bold text-sm rounded-2xl py-3.5 shadow-sm">
            <Download className="w-4 h-4" /> Scarica il diario in PDF
          </a>
        )}
        <PublicPdfExport diary={{
          entries: diary.entries, ownerName: diary.ownerName, title: diary.config.title,
          subtitle: diary.config.subtitle, coverUrl: diary.config.coverUrl, dateRangeLabel: diary.dateRangeLabel,
        }} />

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}

/** Riepilogo compatto usato in testa alla pagina di una escursione. */
export function EntryQuickStats({ km, dplus, seconds }: { km: number; dplus: number; seconds: number }) {
  return (
    <p className="font-mono text-xs text-[#95886A] flex items-center gap-1.5">
      <RouteIcon className="w-3.5 h-3.5 text-[#C4BEAD]" />
      {km.toFixed(1)} km · {Math.round(dplus)} m D+{seconds > 0 && ` · ${formatDuration(seconds)}`}
    </p>
  )
}
