'use client'
// Pagina di un'escursione nel libro privato — versione per SCHERMO, non per stampa.
//
// Perché esiste accanto a DiarioReportPage.tsx invece di modificarlo: quel componente è anche la
// fonte esatta del PDF del Diario — app/diario/libro/[id]/page.tsx clona dal DOM live i nodi
// `.diario-page` che produce (querySelectorAll('#diario-book .diario-page')), poi li manipola
// (rimpiazza le mappe Leaflet con un raster, nasconde i controlli di modifica) per generare le
// pagine del PDF. Toccare la sua impaginazione per renderla responsiva avrebbe rischiato di
// rompere quella pipeline. Qui invece: stessa identità visiva e stessi dati di
// components/leggi/PublicReportPage.tsx (la versione già responsiva del sito pubblico), con in più
// i controlli di modifica che sul sito pubblico non esistono (Personalizza/Escludi/scelta foto) —
// niente `data-mag-block`/`pdf-block`, niente larghezza fissa 794px: Tailwind puro, mobile a
// colonna singola, da lg: in su una griglia a tre colonne (Scheda · testo a larghezza di lettura ·
// rail fotografico), come nel mockup di direzione discusso con l'utente.
//
// DiarioReportPage.tsx resta invariato e continua a vivere (nascosto sotto lg:, sempre montato per
// il PDF) in app/diario/libro/[id]/page.tsx: questo file non lo sostituisce, gli affianca la vista
// a schermo.
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Route, Mountain, Clock, Flame, EyeOff, SlidersHorizontal, Image as ImageIcon, X, ChevronDown,
} from 'lucide-react'
import type { ActivityMeta } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import { MAX_PHOTOS_PER_ACTIVITY } from '@/lib/activityPhotos'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import { wmoInfo } from '@/lib/openmeteo'
import { parseSections } from '@/lib/reportStore'
import { parseInlineEmphasis } from '@/lib/guideMarkup'
import { selectSpreadPhotos } from '@/lib/photoBuckets'
import { LazyMount } from '@/components/LazyMount'
import { LocatorMap } from '@/components/LocatorMap'
import { trackPointsProgress, extractCuriosita } from './chartUtils'
import { ProgressChart } from './ProgressChart'
import { StatCard } from './StatCard'
import { DiarioYearBand, type DiarioYearBandInfo } from './DiarioYearDivider'
import { DIARY_MAX_PHOTOS_DEFAULT } from './DiarioReportPage'
import { GREEN, BLUE, type DiaryReport, type ReportExtras } from './types'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

function renderInline(text: string) {
  return parseInlineEmphasis(text).map((seg, k) =>
    seg.bold ? <strong key={k} className="font-semibold">{seg.text}</strong> : <span key={k}>{seg.text}</span>,
  )
}

const STORY_ACCENTS = [
  { bg: '#fdf6ee', border: '#e08d3c', text: '#6a2e18' },
  { bg: '#f1f8f2', border: '#378d44', text: '#193b20' },
]

const EXTRAS_LABELS: [keyof ReportExtras, string][] = [
  ['mappa', 'Mappa percorso'],
  ['statistiche', 'Statistiche'],
  ['grafico', 'Profilo altimetrico'],
  ['cuore', 'Frequenza cardiaca'],
  ['velocita', 'Velocità'],
]

/** "Personalizza questa pagina" — stesso popover concettuale di DiarioReportPage.tsx, ma nella
 *  barra degli strumenti in cima alla pagina invece che ancorato a un offset in px pensato per un
 *  foglio 794px fisso. */
function CustomizeExtras({ extras, onChange }: { extras: ReportExtras; onChange: (patch: Partial<ReportExtras>) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} title="Personalizza questa pagina"
        className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
        <SlidersHorizontal className="w-3.5 h-3.5" /> Personalizza
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1.5 w-52 bg-white rounded-lg border border-stone-200 shadow-lg p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-barlow text-[9px] font-bold tracking-[0.15em] uppercase text-stone-400">Solo qui</span>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600"><X className="w-3 h-3" /></button>
          </div>
          {EXTRAS_LABELS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 py-1 text-xs text-stone-700 cursor-pointer">
              <input type="checkbox" checked={extras[key]} onChange={e => onChange({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Scelta manuale delle foto da mostrare — stesso principio di DiarioReportPage.tsx (la selezione
 *  automatica distribuita fa da proposta di partenza), popover nella barra strumenti. */
function PhotoPicker({ photos, selected, onChange }: {
  photos: RoutePhoto[]; selected: string[]; onChange: (ids: string[]) => void
}) {
  const max = MAX_PHOTOS_PER_ACTIVITY
  const [open, setOpen] = useState(false)
  const isAuto = selected.length === 0
  const active = new Set(isAuto ? photos.map(p => p.id) : selected)

  const toggle = (id: string) => {
    const next = new Set(active)
    if (next.has(id)) next.delete(id)
    else if (next.size < max) next.add(id)
    else return
    onChange(Array.from(next))
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} title="Scegli le foto"
        className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-forest-700 transition">
        <ImageIcon className="w-3.5 h-3.5" /> Foto {active.size}/{MAX_PHOTOS_PER_ACTIVITY}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1.5 w-72 bg-white rounded-lg border border-stone-200 shadow-lg p-2.5 max-h-80 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="font-barlow text-[9px] font-bold tracking-[0.15em] uppercase text-stone-400">
              {isAuto ? 'Tutte pubblicate' : `${active.size} di ${photos.length}`}
            </span>
            <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-600"><X className="w-3 h-3" /></button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {photos.map(ph => {
              const on = active.has(ph.id)
              return (
                <button key={ph.id} onClick={() => toggle(ph.id)} title={ph.caption || 'Foto'} className="p-0 leading-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.thumbUrl ?? ph.url} alt="" className="w-full aspect-square object-cover rounded"
                    style={{ outline: on ? '2px solid #e08d3c' : '1px solid #dcd8cc', opacity: on ? 1 : 0.45 }} />
                </button>
              )
            })}
          </div>
          {!isAuto && (
            <button onClick={() => onChange([])} className="w-full mt-2 py-1.5 rounded border border-stone-200 text-xs text-stone-600">
              Pubblicale tutte
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SchedaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="pb-3 mb-3 border-b border-stone-100 last:border-0 last:pb-0 last:mb-0">
      <p className="font-barlow text-[9px] font-semibold tracking-[0.15em] uppercase text-stone-400 mb-1">{label}</p>
      <p className="font-lora text-[13px] text-stone-800">{value}</p>
    </div>
  )
}

export function AppReportPage({
  report, photos, meta, extras, trackPoints, escNumber, maxPhotos = DIARY_MAX_PHOTOS_DEFAULT,
  selectedPhotoIds, onSelectedPhotosChange, yearBand, onExclude, onExtrasChange,
}: {
  report: DiaryReport; photos: RoutePhoto[]; meta?: ActivityMeta; extras: ReportExtras
  trackPoints?: TrackPoint[]; escNumber: number
  maxPhotos?: number
  selectedPhotoIds?: string[]
  onSelectedPhotosChange?: (ids: string[]) => void
  yearBand?: DiarioYearBandInfo
  onExclude?: () => void
  onExtrasChange?: (patch: Partial<ReportExtras>) => void
}) {
  const act = report.activity
  const sections = useMemo(() => parseSections(report.content).map(s => {
    const { clean, quotes } = extractCuriosita(s.body)
    return { title: s.title, body: clean, quotes }
  }), [report.content])
  const allQuotes = useMemo(() => sections.flatMap(s => s.quotes), [sections])
  const pullQuote = allQuotes[0]
  const storyBoxes = allQuotes.slice(1)

  const escLabel = String(escNumber).padStart(2, '0')
  const dateStr = act?.start_time
    ? format(new Date(act.start_time), 'd MMMM yyyy', { locale: it })
    : report.created_at ? format(new Date(report.created_at), 'd MMMM yyyy', { locale: it }) : ''
  const monthYear = act?.start_time ? format(new Date(act.start_time), 'MMMM yyyy', { locale: it }) : ''

  const diaryPhotos = useMemo(() => {
    const manual = selectedPhotoIds && selectedPhotoIds.length > 0
      ? photos.filter(p => selectedPhotoIds.includes(p.id))
      : null
    return selectSpreadPhotos(manual ?? photos, maxPhotos)
  }, [photos, maxPhotos, selectedPhotoIds])
  const heroPhoto = photos[0] ?? null
  const weather = act?.weather_at_hike
  const weatherInfo = weather ? wmoInfo(weather.weathercode) : null
  const showMappa = extras.mappa && (meta?.routePolyline?.length ?? 0) > 1
  const showStatistiche = extras.statistiche && !!meta

  const tp = trackPoints ?? []
  const progress = useMemo(() => tp.length > 1 ? trackPointsProgress(tp) : [], [tp])
  const photoMarkers = useMemo(() => photos
    .filter(p => typeof p.progress === 'number')
    .map(p => ({ progress: p.progress, url: p.thumbUrl ?? p.url })), [photos])

  const altitudeSeries = useMemo(() => tp
    .map((p, i) => p.altitudeMeters !== undefined ? { progress: progress[i], value: p.altitudeMeters } : null)
    .filter((x): x is { progress: number; value: number } => x !== null), [tp, progress])
  const hrSeries = useMemo(() => tp
    .map((p, i) => p.heartRateBpm !== undefined ? { progress: progress[i], value: p.heartRateBpm } : null)
    .filter((x): x is { progress: number; value: number } => x !== null), [tp, progress])
  const speedSeries = useMemo(() => tp
    .map((p, i) => p.speedMs !== undefined ? { progress: progress[i], value: p.speedMs * 3.6 } : null)
    .filter((x): x is { progress: number; value: number } => x !== null), [tp, progress])

  const showGrafico = extras.grafico && altitudeSeries.length > 1
  const showCuore = extras.cuore && hrSeries.length > 1
  const showVelocita = extras.velocita && speedSeries.length > 1

  const introSection = sections[0]
  const restSections = sections.slice(1).filter(s => s.body.trim())

  const hasEditControls = !!onExtrasChange || !!(onSelectedPhotosChange && photos.length > 0) || !!onExclude
  const railPhotos = photos.length > 1 ? diaryPhotos.filter(p => p.id !== heroPhoto?.id) : diaryPhotos

  return (
    <article className="w-full bg-white scroll-mt-14 relative">
      {yearBand && <DiarioYearBand {...yearBand} />}

      {hasEditControls && (
        <div className="flex flex-wrap items-center gap-4 px-4 sm:px-8 lg:px-12 py-2.5 bg-stone-50 border-b border-stone-200">
          {onExtrasChange && <CustomizeExtras extras={extras} onChange={onExtrasChange} />}
          {onSelectedPhotosChange && photos.length > 0 && (
            <PhotoPicker photos={photos} selected={selectedPhotoIds ?? []} onChange={onSelectedPhotosChange} />
          )}
          {onExclude && (
            <button onClick={onExclude} title="Escludi questa escursione dal diario"
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-red-600 transition">
              <EyeOff className="w-3.5 h-3.5" /> Escludi
            </button>
          )}
        </div>
      )}

      {/* Copertina */}
      <div className="relative h-[260px] sm:h-[360px] lg:h-[420px] overflow-hidden"
        style={{ background: heroPhoto ? undefined : 'linear-gradient(170deg,#0f2e1a 0%,#1b4332 30%,#193b20 62%,#0d1f12 100%)' }}>
        {heroPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 25%, rgba(0,0,0,0.35) 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, transparent 35%, rgba(0,0,0,0.75) 100%)' }} />

        <div className="absolute top-4 sm:top-6 lg:top-8 left-4 sm:left-8 lg:left-12 right-4 sm:right-8">
          <span className="font-barlow font-bold text-[10px] sm:text-[11px] tracking-[0.3em] uppercase text-terra-300">
            Escursione #{escLabel}{monthYear ? ` · ${monthYear}` : ''}
          </span>
        </div>

        <div className="absolute bottom-4 sm:bottom-7 lg:bottom-9 left-4 sm:left-8 lg:left-12 right-4 sm:right-8">
          <h1 className="font-display font-bold text-white leading-[1.05] tracking-tight text-[28px] sm:text-5xl lg:text-6xl"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            {report.title || act?.title || 'Escursione'}
          </h1>
          <div className="w-12 h-0.5 bg-terra-500 mt-3" />
        </div>
      </div>

      {/* Striscia statistiche */}
      {act && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10">
          {[
            { label: 'Distanza', value: act.distance_meters > 0 ? `${(act.distance_meters / 1000).toFixed(1)}` : '—', sub: 'km' },
            { label: 'Dislivello', value: act.elevation_gain > 0 ? `${Math.round(act.elevation_gain)}` : '—', sub: 'm D+' },
            { label: 'Durata', value: act.total_time_seconds > 0 ? formatDuration(act.total_time_seconds) : '—', sub: 'in movimento' },
            weatherInfo && weather
              ? { label: 'Meteo', value: `${Math.round(weather.temperature)}°C`, sub: weatherInfo.label }
              : { label: 'Calorie', value: meta?.calories ? `${meta.calories}` : '—', sub: 'kcal' },
          ].map(s => (
            <div key={s.label} className="bg-forest-900 px-4 sm:px-6 lg:px-8 py-4">
              <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-terra-300 mb-1.5">{s.label}</p>
              <p className="font-mono text-xl sm:text-2xl font-medium text-white leading-none">{s.value}</p>
              <p className="text-[10px] text-white/40 mt-1">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Data + quota massima */}
      {dateStr && (
        <div className="bg-stone-50 border-t border-stone-200 px-4 sm:px-8 lg:px-12 py-3">
          <p className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-stone-500">
            {dateStr}{!!meta?.altitudeMax && ` · Quota max ${Math.round(meta.altitudeMax)} m`}
          </p>
        </div>
      )}

      <div className="px-4 sm:px-8 lg:px-12 py-6 sm:py-9">
        <p className="font-barlow font-bold text-[10px] sm:text-[11px] tracking-[0.25em] uppercase text-terra-500 mb-5">
          Cronaca · Escursione #{escLabel}
        </p>

        {/* Da lg: griglia a 3 colonne — Scheda · testo a larghezza di lettura · rail fotografico.
            Sotto lg gli stessi elementi restano nell'ordine del documento: nessuna riorganizzazione
            del DOM tra le due rese, solo il genitore diventa una griglia. */}
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,660px)_1fr] lg:gap-12 lg:items-start">

          {/* Scheda — solo da lg in su */}
          <aside className="hidden lg:block lg:sticky lg:top-20">
            <p className="font-barlow font-black text-[10px] tracking-[0.18em] uppercase text-stone-400 mb-3.5 pb-2.5 border-b-[1.5px] border-terra-500">
              Scheda
            </p>
            <SchedaField label="Escursione" value={`#${escLabel}`} />
            {dateStr && <SchedaField label="Periodo" value={dateStr} />}
            {!!meta?.altitudeMax && <SchedaField label="Quota massima" value={`${Math.round(meta.altitudeMax)} m`} />}
            {weatherInfo && weather && <SchedaField label="Meteo" value={`${weatherInfo.emoji} ${weatherInfo.label} · ${Math.round(weather.temperature)}°C`} />}
          </aside>

          {/* Testo */}
          <div className="min-w-0">
            {(!introSection || !introSection.body.trim()) && (
              <h2 className="font-display font-bold text-forest-900 text-2xl sm:text-[32px] leading-tight -tracking-[0.5px] mb-5">
                {report.title || act?.title || 'Escursione'}
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
                    {report.title || act?.title || 'Escursione'}
                  </h2>
                  {paragraph}
                </div>
              ) : <div key={j}>{paragraph}</div>
            })}

            {pullQuote && (
              <div className="relative border-t-2 border-b-2 border-forest-900 px-2 py-7 mb-8">
                <span className="absolute -top-6 left-0 font-display text-forest-900/10 select-none" style={{ fontSize: 64, lineHeight: 1 }}>&ldquo;</span>
                <p className="font-display italic text-forest-900 text-[17px] sm:text-lg leading-[1.55]">
                  {renderInline(pullQuote)}
                </p>
              </div>
            )}

            {restSections.map((section, i) => (
              <div key={i} className="mb-5">
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
              </div>
            ))}

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

            {showStatistiche && meta && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <StatCard value={`${(meta.distanceMeters / 1000).toFixed(1)} km`} label="Distanza" icon={<Route style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={`${Math.round(meta.elevationGain)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={formatDuration(meta.totalTimeSeconds)} label="Durata" icon={<Clock style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
                <StatCard value={meta.calories ? `${meta.calories}` : '—'} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
              </div>
            )}
            {showGrafico && (
              <div className="mb-4">
                <p className="font-barlow font-bold text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-1.5">
                  Profilo altimetrico {photoMarkers.length > 0 && '· con posizione foto'}
                </p>
                <div className="rounded-lg p-3" style={{ background: GREEN.bg, border: `1px solid ${GREEN.border}` }}>
                  <ProgressChart series={altitudeSeries} photoMarkers={photoMarkers} accent={GREEN} unit=" m" />
                </div>
              </div>
            )}
            {(showCuore || showVelocita) && (
              <div className="flex flex-col gap-3 mb-4">
                {showCuore && (
                  <div>
                    <p className="font-barlow font-bold text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-1.5">Frequenza cardiaca</p>
                    <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                      <ProgressChart series={hrSeries} accent={{ bg: '#fef2f2', border: '#fecaca', text: '#991b1b', iconBg: '#fee2e2', iconColor: '#dc2626' }} unit=" bpm" />
                    </div>
                  </div>
                )}
                {showVelocita && (
                  <div>
                    <p className="font-barlow font-bold text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-1.5">Velocità</p>
                    <div className="rounded-lg p-3" style={{ background: BLUE.bg, border: `1px solid ${BLUE.border}` }}>
                      <ProgressChart series={speedSeries} accent={BLUE} unit=" km/h" decimals={1} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {showMappa && meta?.routePolyline && (
              <div className="mb-5">
                <p className="font-display font-bold text-forest-900 text-lg mb-3">Il percorso</p>
                <div className="float-right w-20 ml-2.5 mb-1.5">
                  <LocatorMap eager lat={meta.routePolyline[0][0]} lon={meta.routePolyline[0][1]} label={meta.title ?? undefined} />
                </div>
                <div className="h-[260px] rounded-lg overflow-hidden border border-stone-200">
                  <LazyMount height={260} placeholder={<div className="h-full bg-stone-100" />}>
                    <AllRoutesMap
                      routes={[{ id: meta.id, title: meta.title ?? 'Percorso', startTime: meta.startTime, polyline: meta.routePolyline }]}
                      height="260px" interactive
                    />
                  </LazyMount>
                </div>
                <div className="clear-both" />
              </div>
            )}
          </div>

          {/* Rail fotografico — su mobile/tablet è semplicemente la coda della pagina (stesso
              markup, il genitore non è ancora una griglia sotto lg:); da lg diventa la terza
              colonna. */}
          {railPhotos.length > 0 && (
            <div className="flex flex-col gap-4 mt-6 lg:mt-0">
              {railPhotos.map((ph, i) => (
                <div key={ph.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt={ph.caption ?? ''} loading="lazy" decoding="async"
                    className="w-full aspect-[4/3] object-cover rounded-lg shadow-sm" />
                  <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-terra-500 text-white rounded-full text-center text-[10px] font-bold leading-5 border border-white">{i + 1}</span>
                  {ph.caption && <p className="text-[11px] text-stone-500 text-center mt-1.5 italic font-lora">{ph.caption}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 pt-3.5 mt-8">
          <span className="text-[10px] tracking-[0.2em] uppercase text-stone-300">{report.title || act?.title || 'Escursione'}</span>
          <span className="font-mono text-[10px] text-stone-300">{escLabel}</span>
        </div>
      </div>
    </article>
  )
}

/** Equivalente di DiarioStubPage.tsx (escursione senza racconto) per la vista a schermo. */
export function AppStubPage({ activity, yearBand, onExclude }: {
  activity: ActivityMeta
  yearBand?: DiarioYearBandInfo
  onExclude?: () => void
}) {
  const dateStr = format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })
  return (
    <article className="w-full bg-stone-50 border-2 border-dashed border-stone-300">
      {yearBand && <DiarioYearBand {...yearBand} />}
      <div className="px-4 sm:px-8 lg:px-12 py-8 relative">
        <span className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-stone-300">Da narrare</span>
        {onExclude && (
          <button onClick={onExclude} title="Escludi questa escursione dal diario"
            className="absolute top-6 right-4 sm:right-8 lg:right-12 flex items-center gap-1.5 text-xs font-semibold text-stone-400 hover:text-red-600 transition">
            <EyeOff className="w-3.5 h-3.5" /> Escludi
          </button>
        )}
        <p className="font-barlow font-bold text-[9px] tracking-[0.2em] uppercase text-stone-400 mt-4 mb-1">{dateStr}</p>
        <h2 className="font-display font-bold text-stone-600 text-2xl mb-5">{activity.title ?? 'Escursione'}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-2 max-w-xl">
          <div className="bg-white border border-stone-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[9px] text-stone-400 font-barlow uppercase tracking-wide">Distanza</div>
            <div className="text-base font-mono text-stone-600">{(activity.distanceMeters / 1000).toFixed(2)} km</div>
          </div>
          <div className="bg-white border border-stone-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[9px] text-stone-400 font-barlow uppercase tracking-wide">Dislivello</div>
            <div className="text-base font-mono text-stone-600">{Math.round(activity.elevationGain)} m</div>
          </div>
          <div className="bg-white border border-stone-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[9px] text-stone-400 font-barlow uppercase tracking-wide">Durata</div>
            <div className="text-base font-mono text-stone-600">{formatDuration(activity.totalTimeSeconds)}</div>
          </div>
          <div className="bg-white border border-stone-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[9px] text-stone-400 font-barlow uppercase tracking-wide">Calorie</div>
            <div className="text-base font-mono text-stone-600">{activity.calories ? `${activity.calories} kcal` : '—'}</div>
          </div>
        </div>
        <a href={`/resoconto/${encodeURIComponent(activity.id)}`}
          className="inline-flex items-center gap-2 mt-5 bg-forest-900 hover:bg-forest-800 text-white font-barlow font-bold text-xs uppercase tracking-wide px-5 py-2.5 rounded-lg transition-colors">
          Racconta questa escursione <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
        </a>
      </div>
    </article>
  )
}
