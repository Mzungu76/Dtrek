// Pagina di un'escursione nel sito pubblico del Diario — stesso stile a rivista del libro privato
// (components/diario/DiarioReportPage.tsx): copertina scura, striscia di statistiche, capolettera,
// citazione centrale, box curiosità, grafici, foto numerate. Qui però reimpaginata per il telefono
// invece che ristretta da un foglio A4: niente colonna "Scheda" a fianco del testo (su un telefono
// stringe il racconto in un corridoio stretto), niente foto in una colonnina di 164px, niente
// riquadro a larghezza fissa con margine e ombra come un foglio appoggiato su un tavolo — la
// copertina e le statistiche sono a bordo pagina, il testo scorre a colonna singola su tutta la
// larghezza disponibile, le proporzioni cambiano con `sm:` invece di essere fisse in pixel.
//
// Tre differenze deliberate rispetto all'originale, tutte concordate:
//  1. Nessun controllo di modifica (Personalizza/Escludi/scelta foto): quei pulsanti nel privato
//     sono già opzionali (props assenti = niente pulsante), qui semplicemente non esistono.
//  2. Le mappe sono quelle statiche del sito pubblico (RouteMap.tsx per percorso e POI,
//     PhotoRouteMap.tsx per le foto — due mappe distinte, non una sola affollata: tile OpenStreetMap
//     vere, stile "light" cioè gli stessi tile osm.org che Leaflet userebbe, + traccia SVG, zero
//     JavaScript) invece del Leaflet del libro — che comunque, in lettura, non è interattivo
//     nemmeno lì (`mapsInteractive=false`): stessa resa a schermo, senza spedire un runtime di
//     mappe a un link pubblico.
//  3. Le foto non sono capate a un tetto come nel PDF: il commento originale dice già "restano
//     tutte... sulla pagina pubblica" — qui compaiono tutte, non solo le sei che entrano in stampa.
//
// Componente SERVER: nessuno stato, nessun JavaScript spedito al browser.
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Route, Mountain, Clock, Flame } from 'lucide-react'
import { formatDuration } from '@/lib/tcxParser'
import { parseSections } from '@/lib/reportStore'
import { parseInlineEmphasis } from '@/lib/guideMarkup'
import { extractCuriosita } from '@/components/diario/chartUtils'
import { formatPublicDate } from '@/lib/privacy/formatPublicDate'
import { ProgressChart } from '@/components/diario/ProgressChart'
import { StatCard } from '@/components/diario/StatCard'
import { GREEN, BLUE } from '@/components/diario/types'
import { LocatorMap } from '@/components/LocatorMap'
import type { PublicDiaryEntry } from '@/lib/sharePublicDiary'
import type { DiaryPublicSections } from '@/lib/diaryConfig'
import { RouteMap, PoiCaption } from '@/app/leggi/d/[token]/RouteMap'
import { PhotoRouteMap } from '@/app/leggi/d/[token]/PhotoRouteMap'

function renderInline(text: string) {
  return parseInlineEmphasis(text).map((seg, k) =>
    seg.bold ? <strong key={k} className="font-semibold">{seg.text}</strong> : <span key={k}>{seg.text}</span>,
  )
}

const STORY_ACCENTS = [
  { bg: '#fdf6ee', border: '#e08d3c', text: '#6a2e18' },
  { bg: '#f1f8f2', border: '#378d44', text: '#193b20' },
]

export function PublicReportPage({ entry, n, show, hideExactDates = false }: {
  entry: PublicDiaryEntry
  n: number
  show: DiaryPublicSections
  /** Preferenza di privacy dell'autore (lib/sharePublicDiary.ts) — mostra solo mese/anno invece
   *  della data esatta. Default false per i chiamanti che non hanno ancora una preferenza a monte. */
  hideExactDates?: boolean
}) {
  const sections = parseSections(show.racconto ? entry.content : '').map(s => {
    const { clean, quotes } = extractCuriosita(s.body)
    return { title: s.title, body: clean, quotes }
  })
  const allQuotes = sections.flatMap(s => s.quotes)
  const pullQuote = allQuotes[0]
  const storyBoxes = allQuotes.slice(1)

  const escLabel = String(n).padStart(2, '0')
  const dateStr = formatPublicDate(entry.startTime, hideExactDates)
  const monthYear = format(new Date(entry.startTime), 'MMMM yyyy', { locale: it })

  const photos = show.foto ? entry.photos : []
  const heroPhoto = photos[0] ?? null
  const detailPhoto = photos[1] ?? null
  const galleryPhotos = photos.slice(2)

  const introSection = sections[0]
  const restSections = sections.slice(1).filter(s => s.body.trim())

  const showStatistiche = show.statistiche
  const showGrafico  = show.grafici && entry.altitudeSeries.length > 1
  const showCuore    = show.grafici && entry.hrSeries.length > 1
  const showVelocita = show.grafici && entry.speedSeriesKmh.length > 1
  const showMappa    = show.percorso && !!entry.polyline && entry.polyline.length > 1

  // Foto con una posizione nota lungo il percorso — per la loro mappa a sé (PhotoRouteMap.tsx), non
  // per quella del percorso/POI qui sopra: vedi il commento in cima a RouteMap.tsx sul perché sono
  // due mappe distinte invece di una sola più affollata.
  const photosWithProgress = photos
    .filter((p): p is typeof p & { progress: number } => p.progress != null)
    .map(p => ({ url: p.url, progress: p.progress }))
  const showFotoMappa = showMappa && photosWithProgress.length > 0

  return (
    <article id={`esc-${n}`} className="w-full bg-white scroll-mt-14">
      {/* Apertura — a bordo pagina, non una card ristretta */}
      <div className="relative h-[260px] sm:h-[360px] overflow-hidden"
        style={{ background: heroPhoto ? undefined : 'linear-gradient(170deg,#0f2e1a 0%,#1b4332 30%,#193b20 62%,#0d1f12 100%)' }}>
        {heroPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 25%, rgba(0,0,0,0.35) 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 35%, rgba(0,0,0,0.75) 100%)' }} />

        <div className="absolute top-4 sm:top-6 left-4 sm:left-8 right-4 sm:right-8">
          <span className="font-barlow font-bold text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-terra-300">
            Escursione #{escLabel} · {monthYear}
          </span>
        </div>

        <div className="absolute bottom-4 sm:bottom-7 left-4 sm:left-8 right-4 sm:right-8">
          <h1 className="font-display font-bold text-white leading-[1.05] tracking-tight text-[28px] sm:text-5xl"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            {entry.title}
          </h1>
          <div className="w-12 h-0.5 bg-terra-500 mt-3" />
        </div>
      </div>

      {/* Striscia statistiche — 2x2 su telefono, 4 in fila da tablet in su. `gap-px` + sfondo
          condiviso disegna le linee divisorie: regge qualunque numero di colonne senza dover
          calcolare a mano quale cella ha bordo destro/basso. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10">
        {[
          { label: 'Distanza', value: entry.distanceMeters > 0 ? `${(entry.distanceMeters / 1000).toFixed(1)}` : '—', sub: 'km' },
          { label: 'Dislivello', value: entry.elevationGain > 0 ? `${Math.round(entry.elevationGain)}` : '—', sub: 'm D+' },
          { label: 'Durata', value: entry.totalTimeSeconds > 0 ? formatDuration(entry.totalTimeSeconds) : '—', sub: 'in movimento' },
          { label: 'Calorie', value: entry.calories ? `${entry.calories}` : '—', sub: 'kcal' },
        ].map(s => (
          <div key={s.label} className="bg-forest-900 px-4 sm:px-6 py-4">
            <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-terra-300 mb-1.5">{s.label}</p>
            <p className="font-mono text-xl sm:text-2xl font-medium text-white leading-none">{s.value}</p>
            <p className="text-[10px] text-white/40 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Data + quota massima */}
      <div className="bg-stone-50 border-t border-stone-200 px-4 sm:px-8 py-3">
        <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-stone-500">
          {dateStr}{!!entry.altitudeMax && ` · Quota max ${Math.round(entry.altitudeMax)} m`}
        </p>
      </div>

      <div className="px-4 sm:px-8 py-6 sm:py-9">
        <p className="font-barlow font-bold text-[10px] sm:text-[11px] tracking-[0.25em] uppercase text-terra-500 mb-5">
          Cronaca · Escursione #{escLabel}
        </p>

        {/* Titolo + intro, a colonna singola */}
        <div className="mb-8">
          {(!introSection || !introSection.body.trim()) && (
            <h2 className="font-display font-bold text-forest-900 text-2xl sm:text-[32px] leading-tight -tracking-[0.5px]">
              {entry.title}
            </h2>
          )}
          {introSection && introSection.body.split(/\n\n+/).filter(p => p.trim()).map((p, j) => {
            const text = p.trim()
            const dropCap = j === 0 && text.length > 0
            const segments = parseInlineEmphasis(text)
            const first = segments[0]
            const paragraph = (
              <p className="font-lora text-[15px] leading-[1.85] text-stone-700 mb-4">
                {dropCap ? (
                  <>
                    <span className="float-left font-display font-bold text-terra-500 leading-[0.8] pr-1.5 pt-1" style={{ fontSize: 52 }}>
                      {first?.text[0] ?? ''}
                    </span>
                    {first?.bold ? <strong className="font-semibold">{first.text.slice(1)}</strong> : first?.text.slice(1)}
                    {segments.slice(1).map((seg, k) =>
                      seg.bold ? <strong key={k} className="font-semibold">{seg.text}</strong> : <span key={k}>{seg.text}</span>,
                    )}
                  </>
                ) : renderInline(text)}
              </p>
            )
            return j === 0 ? (
              <div key={j}>
                <h2 className="font-display font-bold text-forest-900 text-2xl sm:text-[32px] leading-tight -tracking-[0.5px] mb-5">
                  {entry.title}
                </h2>
                {paragraph}
              </div>
            ) : <div key={j}>{paragraph}</div>
          })}
        </div>

        {/* Citazione centrale */}
        {pullQuote && (
          <div className="relative border-t-2 border-b-2 border-forest-900 px-2 py-7 mb-8">
            <span className="absolute -top-6 left-0 font-display text-forest-900/10 select-none" style={{ fontSize: 64, lineHeight: 1 }}>&ldquo;</span>
            <p className="font-display italic text-forest-900 text-[17px] sm:text-lg leading-[1.55]">
              {renderInline(pullQuote)}
            </p>
          </div>
        )}

        {/* Resto del racconto */}
        {restSections.map((section, i) => (
          <div key={i} className="mb-5">
            {i === 0 && detailPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="float-none w-full mb-4 sm:float-right sm:w-[42%] sm:ml-5 sm:mb-3 relative rounded-lg overflow-hidden">
                <img src={detailPhoto.url} alt={detailPhoto.caption ?? ''} loading="lazy" decoding="async" className="w-full aspect-[4/3] sm:aspect-[3/4] object-cover" />
                {detailPhoto.caption && (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <p className="absolute bottom-2 left-2 right-2 font-lora italic text-[11px] text-white/90 leading-snug">
                      {detailPhoto.caption}
                    </p>
                  </>
                )}
              </div>
            )}
            {section.body.split(/\n\n+/).filter(p => p.trim()).map((p, j) => {
              const paragraph = (
                <p className="font-lora text-[15px] leading-[1.85] text-stone-700 mb-3.5">{renderInline(p.trim())}</p>
              )
              return j === 0 ? (
                <div key={j}>
                  <p className="font-barlow font-bold text-[11px] tracking-[0.2em] uppercase text-terra-500 mb-2">
                    {section.title}
                  </p>
                  {paragraph}
                </div>
              ) : <div key={j}>{paragraph}</div>
            })}
            <div className="clear-both" />
          </div>
        ))}

        {/* Box curiosità */}
        {storyBoxes.length > 0 && (
          <div className="flex flex-col gap-3 mb-8">
            {storyBoxes.map((q, i) => {
              const acc = STORY_ACCENTS[i % STORY_ACCENTS.length]
              return (
                <div key={i} className="rounded-r-lg py-4 px-5" style={{ background: acc.bg, borderLeft: `3px solid ${acc.border}` }}>
                  <p className="font-lora italic text-[13.5px] leading-[1.75]" style={{ color: acc.text }}>{renderInline(q)}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Dati e percorso */}
        {showStatistiche && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatCard value={`${(entry.distanceMeters / 1000).toFixed(1)} km`} label="Distanza" icon={<Route style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={`${Math.round(entry.elevationGain)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={formatDuration(entry.totalTimeSeconds)} label="Durata" icon={<Clock style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={entry.calories ? `${entry.calories}` : '—'} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
          </div>
        )}
        {showGrafico && (
          <div className="mb-4">
            <p className="font-barlow font-bold text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-1.5">
              Profilo altimetrico
            </p>
            <div className="rounded-lg p-3" style={{ background: GREEN.bg, border: `1px solid ${GREEN.border}` }}>
              <ProgressChart series={entry.altitudeSeries} accent={GREEN} unit=" m" />
            </div>
          </div>
        )}
        {(showCuore || showVelocita) && (
          <div className="flex flex-col gap-3 mb-4">
            {showCuore && (
              <div>
                <p className="font-barlow font-bold text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-1.5">
                  Frequenza cardiaca
                </p>
                <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                  <ProgressChart series={entry.hrSeries} accent={{ bg: '#fef2f2', border: '#fecaca', text: '#991b1b', iconBg: '#fee2e2', iconColor: '#dc2626' }} unit=" bpm" />
                </div>
              </div>
            )}
            {showVelocita && (
              <div>
                <p className="font-barlow font-bold text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-1.5">
                  Velocità
                </p>
                <div className="rounded-lg p-3" style={{ background: BLUE.bg, border: `1px solid ${BLUE.border}` }}>
                  <ProgressChart series={entry.speedSeriesKmh} accent={BLUE} unit=" km/h" decimals={1} />
                </div>
              </div>
            )}
          </div>
        )}
        {showMappa && (
          <div className="mb-5">
            <p className="font-display font-bold text-forest-900 text-lg mb-3">Il percorso</p>
            <div className="float-right w-20 ml-2.5 mb-1.5">
              <LocatorMap eager lat={entry.polyline![0][0]} lon={entry.polyline![0][1]} label={entry.title} />
            </div>
            <RouteMap polyline={entry.polyline!} pois={entry.pois} />
            <div className="clear-both" />
            <PoiCaption pois={entry.pois} />
          </div>
        )}

        {/* Mappa a sé per le foto (mai insieme a percorso/POI: vedi RouteMap.tsx) */}
        {showFotoMappa && (
          <div className="mb-5">
            <p className="font-display font-bold text-forest-900 text-lg mb-3">Foto lungo il percorso</p>
            <PhotoRouteMap polyline={entry.polyline!} photos={photosWithProgress} idPrefix={`esc-${n}`} />
          </div>
        )}

        {/* Foto */}
        {galleryPhotos.length > 0 && (
          <div className="mt-4 flex flex-col gap-3.5">
            {galleryPhotos.map((ph, i) => (
              <div key={ph.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={ph.caption ?? ''} loading="lazy" decoding="async" className="w-full aspect-[4/3] object-cover rounded-lg shadow-sm" />
                <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-terra-500 text-white rounded-full text-center text-[10px] font-bold leading-5 border border-white">{i + 1}</span>
                {ph.caption && <p className="text-[11px] text-stone-500 text-center mt-1.5 italic font-lora">{ph.caption}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Piede pagina */}
        <div className="flex items-center justify-between border-t border-stone-100 pt-3.5 mt-8">
          <span className="text-[10px] tracking-[0.2em] uppercase text-stone-300">{entry.title}</span>
          <span className="font-mono text-[10px] text-stone-300">{escLabel}</span>
        </div>
      </div>
    </article>
  )
}
