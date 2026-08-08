// Pagina pubblica del Diario — una rivista web, non più un guscio attorno a un PDF.
//
// Prima questa pagina mostrava copertina, tre numeri e un indice, e per leggere una sola riga di
// racconto bisognava scaricare un PDF da decine di MB o sfogliarlo con un visualizzatore che su
// un telefono rendeva una pagina A4 in 351 px — corpo del testo a ~4,7 px, illeggibile. Il
// contenuto ora arriva dal database insieme alla pagina (vedi lib/sharePublicDiary.ts) e viene
// impaginato per la lettura, in colonna singola.
//
// Componente SERVER di proposito: nessuno stato, nessun `use client`, nessun JavaScript spedito
// al browser. Chi apre il link da una chat scarica del testo e delle immagini pigre, non un
// runtime. In più il contenuto è indicizzabile e selezionabile, che un PDF rasterizzato non è.

import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Download, Route as RouteIcon, Mountain, Clock } from 'lucide-react'
import { withForcedDownload } from '@/lib/storageDownloadUrl'
import { parseSections } from '@/lib/reportStore'
import { parseMarkupBlocks, parseInlineEmphasis } from '@/lib/guideMarkup'
import { formatDuration } from '@/lib/tcxParser'
import { hasNarrative, type PublicDiary, type PublicDiaryEntry } from '@/lib/sharePublicDiary'
import { RouteSketch } from './RouteSketch'

/** Il corpo dei resoconti è markdown: gli asterischi dell'enfasi vanno resi, non stampati. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInlineEmphasis(text).map((seg, i) =>
        seg.bold ? <strong key={i} className="font-semibold text-stone-800">{seg.text}</strong> : <span key={i}>{seg.text}</span>,
      )}
    </>
  )
}

function StatCell({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex-1 min-w-0 px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-forest-700">
        {icon}
        <span className="font-mono text-base font-bold leading-none">{value}</span>
      </div>
      <div className="text-[9px] font-semibold text-stone-400 uppercase tracking-wider mt-1">{label}</div>
    </div>
  )
}

function EntryStats({ entry }: { entry: PublicDiaryEntry }) {
  return (
    <div className="flex items-stretch divide-x divide-stone-100 border-y border-stone-100 my-5">
      <StatCell icon={<RouteIcon className="w-3.5 h-3.5 text-stone-300" />} value={`${(entry.distanceMeters / 1000).toFixed(1)}`} label="km" />
      <StatCell icon={<Mountain className="w-3.5 h-3.5 text-stone-300" />} value={`${Math.round(entry.elevationGain)}`} label="m D+" />
      {entry.totalTimeSeconds > 0 && (
        <StatCell icon={<Clock className="w-3.5 h-3.5 text-stone-300" />} value={formatDuration(entry.totalTimeSeconds)} label="in cammino" />
      )}
      {entry.altitudeMax != null && (
        <StatCell value={`${Math.round(entry.altitudeMax)}`} label="quota max" />
      )}
    </div>
  )
}

function PhotoGrid({ entry }: { entry: PublicDiaryEntry }) {
  if (entry.photos.length === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-6">
      {entry.photos.map((p, i) => (
        <figure key={i} className="min-w-0">
          {/* `loading="lazy"` non è un dettaglio: un diario con dieci escursioni può avere un
              centinaio di foto a piena risoluzione, e chi apre il link spesso è in mobilità. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.caption ?? ''} loading="lazy" decoding="async"
            className="w-full aspect-[4/3] object-cover rounded-xl bg-stone-100" />
          {p.caption && (
            <figcaption className="text-[11px] font-lora italic text-stone-400 text-center mt-1.5 leading-snug">
              {p.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}

/** Escursione con un racconto: articolo completo. */
function EntryArticle({ entry, n }: { entry: PublicDiaryEntry; n: number }) {
  const sections = parseSections(entry.content).filter(s => s.body.trim())

  return (
    <article id={`esc-${n}`} className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden scroll-mt-16">
      {entry.photos[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.photos[0].url} alt="" loading="lazy" decoding="async"
          className="w-full aspect-[16/9] object-cover bg-stone-100" />
      )}

      <div className="p-5 sm:p-7">
        <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-terra-500">
          Escursione #{String(n).padStart(2, '0')} · {format(new Date(entry.startTime), 'MMMM yyyy', { locale: it })}
        </p>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-forest-900 leading-tight mt-1.5">
          {entry.title}
        </h2>
        <p className="text-xs text-stone-400 mt-1.5">
          {format(new Date(entry.startTime), 'd MMMM yyyy', { locale: it })}
        </p>

        <EntryStats entry={entry} />

        {entry.polyline && (
          <div className="max-w-xs mx-auto sm:float-right sm:ml-6 sm:mb-3 sm:max-w-[280px] sm:w-[280px] mb-5">
            <RouteSketch
              polyline={entry.polyline}
              photoProgress={entry.photos.map(p => p.progress).filter((p): p is number => p != null)}
            />
            <p className="text-[10px] text-stone-400 text-center mt-1.5">
              Partenza, arrivo e punti in cui sono state scattate le foto
            </p>
          </div>
        )}

        {sections.map((section, si) => (
          <section key={si} className="mt-6 first:mt-0">
            <h3 className="font-barlow font-bold text-[11px] tracking-[0.2em] uppercase text-terra-500 mb-2">
              {section.title}
            </h3>
            {parseMarkupBlocks(section.body).map((block, bi) => {
              if (block.type === 'curiosita') {
                return (
                  <aside key={bi} className="my-4 rounded-r-xl border-l-[3px] border-terra-500 bg-terra-50/60 px-4 py-3">
                    <p className="font-lora italic text-[15px] leading-relaxed text-stone-600">
                      <Inline text={block.text} />
                    </p>
                  </aside>
                )
              }
              if (block.type === 'avviso') {
                return (
                  <aside key={bi} className="my-4 rounded-r-xl border-l-[3px] border-amber-500 bg-amber-50 px-4 py-3">
                    <p className="text-sm leading-relaxed text-amber-900">
                      <Inline text={block.text} />
                    </p>
                  </aside>
                )
              }
              if (block.type === 'subsection') {
                return (
                  <h4 key={bi} className="font-display font-bold text-base text-forest-800 mt-5 mb-1.5">
                    {block.text}
                  </h4>
                )
              }
              return (
                <p key={bi} className="font-lora text-[15px] leading-[1.75] text-stone-600 mb-3.5">
                  <Inline text={block.text} />
                </p>
              )
            })}
          </section>
        ))}

        <div className="clear-both" />
        <PhotoGrid entry={entry} />
      </div>
    </article>
  )
}

/**
 * Escursione senza racconto: scheda compatta.
 *
 * Un resoconto le cui sezioni esistono ma sono vuote (`## Titolo` e nient'altro) non ha una
 * storia da raccontare — nel PDF queste occupavano due pagine intere a testa, con una fascia
 * fotografica scura vuota e uno spazio narrativo bianco. Qui l'escursione resta nel diario, perché
 * è successa davvero, ma senza fingere un contenuto che non c'è.
 */
function EntryCard({ entry, n }: { entry: PublicDiaryEntry; n: number }) {
  return (
    <article id={`esc-${n}`} className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 flex gap-4 items-center scroll-mt-16">
      {entry.photos[0]
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={entry.photos[0].url} alt="" loading="lazy" decoding="async"
            className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-2xl shrink-0 bg-stone-100" />
        : entry.polyline
          ? <div className="w-20 sm:w-24 shrink-0"><RouteSketch polyline={entry.polyline} /></div>
          : <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shrink-0 bg-stone-100" />
      }
      <div className="min-w-0 flex-1">
        <p className="font-barlow font-bold text-[9px] tracking-[0.2em] uppercase text-terra-500">
          Escursione #{String(n).padStart(2, '0')}
        </p>
        <h2 className="font-display text-lg font-bold text-forest-900 leading-tight mt-0.5 truncate">
          {entry.title}
        </h2>
        <p className="text-xs text-stone-400 mt-0.5">
          {format(new Date(entry.startTime), 'd MMMM yyyy', { locale: it })}
        </p>
        <p className="font-mono text-xs text-stone-500 mt-1.5">
          {(entry.distanceMeters / 1000).toFixed(1)} km · {Math.round(entry.elevationGain)} m D+
          {entry.totalTimeSeconds > 0 && ` · ${formatDuration(entry.totalTimeSeconds)}`}
        </p>
      </div>
    </article>
  )
}

export function DiaryPublicView({ diary }: { diary: PublicDiary; title: string }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-forest-900 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="text-forest-300">▲</span> DTrek
          </div>
          <a href="/" className="text-xs font-semibold bg-white/15 hover:bg-white/25 transition rounded-full px-4 py-1.5">
            Apri l&apos;app
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
        {/* Copertina */}
        <section className="relative rounded-3xl overflow-hidden shadow-sm border border-stone-200">
          <div className="relative p-8 sm:p-10 text-white"
            style={{ background: diary.config.coverUrl ? undefined : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}>
            {diary.config.coverUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={diary.config.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(8,24,14,0.72) 0%, rgba(8,24,14,0.5) 60%, rgba(8,24,14,0.6) 100%)' }} />
              </>
            )}
            <div className="relative">
              {diary.dateRangeLabel && (
                <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-terra-300 mb-3">
                  {diary.dateRangeLabel}
                </p>
              )}
              <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">{diary.config.title}</h1>
              {diary.config.subtitle && <p className="mt-2 font-lora italic text-white/70">{diary.config.subtitle}</p>}
              <p className="mt-4 text-sm text-white/60">di {diary.ownerName}</p>
            </div>
          </div>
        </section>

        {/* Numeri */}
        <section className="grid grid-cols-3 gap-3">
          {[
            { value: String(diary.entries.length), label: diary.entries.length === 1 ? 'Escursione' : 'Escursioni' },
            { value: `${diary.totalKm.toFixed(0)} km`, label: 'Percorsi' },
            { value: `${Math.round(diary.totalElevationGain).toLocaleString('it')} m`, label: 'Dislivello +' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-stone-200 px-3 py-3.5 text-center shadow-sm">
              <div className="font-mono text-xl font-bold text-stone-800 leading-tight">{s.value}</div>
              <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Indice — ancore verso gli articoli più sotto, non più un elenco fine a sé stesso */}
        {diary.entries.length > 1 && (
          <nav className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Le escursioni</h2>
            <ul className="divide-y divide-stone-100">
              {diary.entries.map((e, i) => (
                <li key={e.id}>
                  <a href={`#esc-${i + 1}`} className="flex items-center gap-3 py-2.5 group">
                    <span className="font-mono text-xs text-stone-300 w-6 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-700 truncate group-hover:text-forest-700 transition">{e.title}</p>
                      <p className="text-xs text-stone-400">{format(new Date(e.startTime), 'd MMMM yyyy', { locale: it })}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 text-xs text-stone-500">
                      <RouteIcon className="w-3 h-3 text-stone-300" />
                      {(e.distanceMeters / 1000).toFixed(1)} km
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Gli articoli */}
        {diary.entries.map((entry, i) =>
          hasNarrative(entry.content)
            ? <EntryArticle key={entry.id} entry={entry} n={i + 1} />
            : <EntryCard    key={entry.id} entry={entry} n={i + 1} />,
        )}

        {/* Il PDF è ora un allegato facoltativo: la pagina si legge per intero senza scaricarlo. */}
        {diary.pdfUrl && (
          <a href={withForcedDownload(diary.pdfUrl, 'diario-dtrek.pdf')} download
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 hover:bg-stone-50 transition text-stone-600 font-display font-bold text-sm rounded-2xl py-3.5 shadow-sm">
            <Download className="w-4 h-4" /> Scarica il diario in PDF
          </a>
        )}

        <section className="bg-gradient-to-br from-forest-700 to-forest-900 rounded-3xl p-7 text-center text-white">
          <p className="font-display text-lg font-bold">Tieni il tuo diario di escursioni con DTrek</p>
          <p className="text-sm text-white/70 mt-1.5 max-w-md mx-auto">
            Mappe 3D, profili altimetrici, TrailScore e un diario che ricorda ogni percorso.
          </p>
          <a href="/" className="inline-block mt-4 bg-white text-forest-800 font-display font-semibold text-sm rounded-full px-6 py-2.5 hover:bg-stone-50 transition">
            Scopri DTrek
          </a>
        </section>

        <p className="text-center text-[11px] text-stone-400 pb-4">
          Condiviso tramite DTrek · Mappe © OpenStreetMap contributors
        </p>
      </main>
    </div>
  )
}
