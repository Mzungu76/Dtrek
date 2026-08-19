'use client'
import { FONT } from '@/lib/designTokens'
import { PDF_PAGE_W, PDF_CONTENT_H } from '@/lib/pdfPageGeometry'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Route, Mountain, Clock, Flame, EyeOff, SlidersHorizontal, X, Image as ImageIcon } from 'lucide-react'
import type { ActivityMeta } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import { wmoInfo } from '@/lib/openmeteo'
import { parseSections } from '@/lib/reportStore'
import { parseInlineEmphasis } from '@/lib/guideMarkup'
import { selectSpreadPhotos } from '@/lib/photoBuckets'
import { MAX_PHOTOS_PER_ACTIVITY } from '@/lib/activityPhotos'
import { LazyMount } from '@/components/LazyMount'
import { LocatorMap } from '@/components/LocatorMap'
import { trackPointsProgress, extractCuriosita } from './chartUtils'
import { ProgressChart } from './ProgressChart'
import { StatCard } from './StatCard'
import { DiarioYearBand, type DiarioYearBandInfo } from './DiarioYearDivider'
import { GREEN, BLUE, type DiaryReport, type ReportExtras } from './types'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

/** Il corpo dei resoconti è markdown: senza questo, gli asterischi dell'enfasi finivano stampati
 *  alla lettera nel PDF del Diario (`**9 chilometri**`) — lo stesso bug già corretto in
 *  HiddenPdfRoot.tsx per il PDF del singolo resoconto, qui mancante. */
function renderInline(text: string) {
  return parseInlineEmphasis(text).map((seg, k) =>
    seg.bold ? <strong key={k} style={{ fontWeight: 700 }}>{seg.text}</strong> : <span key={k}>{seg.text}</span>,
  )
}

/**
 * Foto stampate nel Diario per escursione.
 *
 * Non è un numero arbitrario: nel layout a due colonne una foto occupa ~284 px di colonna, cioè
 * quanto diciassette righe di testo. Con lo spazio di due pagine e mezzo per resoconto — tolti
 * racconto, schede, profilo e mappa — sei foto sono quante ne entrano mantenendo il ritmo di una
 * ogni due paragrafi. Le escursioni dell'utente ne hanno da 6 a 17: oltre le sei, il resoconto
 * sforava di una o due pagine quasi vuote.
 *
 * Le foto non stampate non si perdono: restano tutte nel resoconto e sulla pagina pubblica.
 */
export const DIARY_MAX_PHOTOS_DEFAULT = 6

/** Scelta manuale delle foto da stampare, sul modello di CustomizeExtras: vive sulla pagina del
 *  libro, dove si vede il risultato. La selezione automatica distribuita fa da proposta di
 *  partenza; qui si corregge quando la foto migliore cade accanto a un'altra e resterebbe fuori. */
function PhotoPicker({ photos, selected, onChange }: {
  photos: RoutePhoto[]; selected: string[]; onChange: (ids: string[]) => void
}) {
  // Il tetto qui è quello di CARICAMENTO, non quello del PDF: si sceglie cosa pubblicare, e il
  // documento impaginato ne prenderà comunque sei distribuite lungo il percorso.
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
    <div className="diario-editor-control print:hidden" style={{ position: 'absolute', top: 16, right: 232, zIndex: 5 }}>
      <button onClick={() => setOpen(o => !o)} title="Scegli le foto da stampare"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: 'none', cursor: 'pointer',
          fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'white',
        }}>
        <ImageIcon style={{ width: 13, height: 13 }} /> Foto {active.size}/{MAX_PHOTOS_PER_ACTIVITY}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 300,
          background: 'white', borderRadius: 10, border: '1px solid #dcd8cc',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 10, maxHeight: 360, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#a9a18e' }}>
              {isAuto ? 'Tutte pubblicate' : `${active.size} di ${photos.length}`}
            </span>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a9a18e' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {photos.map(ph => {
              const on = active.has(ph.id)
              return (
                <button key={ph.id} onClick={() => toggle(ph.id)} title={ph.caption || 'Foto'}
                  style={{ position: 'relative', padding: 0, border: 'none', background: 'none', cursor: 'pointer', lineHeight: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* DTREK-AUDIT.md P3 #35 */}
                  <img src={ph.thumbUrl ?? ph.url} alt="" style={{
                    width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6,
                    outline: on ? '2px solid #e08d3c' : '1px solid #dcd8cc',
                    opacity: on ? 1 : 0.45,
                  }} />
                </button>
              )
            })}
          </div>
          {!isAuto && (
            <button onClick={() => onChange([])}
              style={{
                width: '100%', marginTop: 8, padding: '5px 0', borderRadius: 8, cursor: 'pointer',
                border: '1px solid #dcd8cc', background: 'white', color: '#73695c',
                fontFamily: FONT.body, fontSize: 11,
              }}>
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
    <>
      <div>
        <p style={{ fontFamily: FONT.body, fontSize: 7.5, fontWeight: 600, letterSpacing: 2, color: '#a9a18e', textTransform: 'uppercase', margin: '0 0 3px' }}>{label}</p>
        <p style={{ fontFamily: FONT.lora, fontSize: 13, color: '#2c2520', margin: 0 }}>{value}</p>
      </div>
      <div style={{ height: 1, background: '#eeece5' }} />
    </>
  )
}

const EXTRAS_LABELS: [keyof ReportExtras, string][] = [
  ['mappa', 'Mappa percorso'],
  ['statistiche', 'Statistiche'],
  ['grafico', 'Profilo altimetrico'],
  ['cuore', 'Frequenza cardiaca'],
  ['velocita', 'Velocità'],
]

/** Popover "Personalizza questa pagina", per uno scostamento dalle impostazioni globali "per ogni
 *  percorso" (definite nel rail Statistiche) valido solo su questa escursione — es. si vuole il
 *  grafico della frequenza cardiaca ovunque tranne che su una salita dove il cardiofrequenzimetro
 *  ha perso il segnale. */
function CustomizeExtras({ extras, onChange }: { extras: ReportExtras; onChange: (patch: Partial<ReportExtras>) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="diario-editor-control print:hidden" style={{ position: 'absolute', top: 16, right: 96, zIndex: 5 }}>
      <button onClick={() => setOpen(o => !o)}
        title="Personalizza questa pagina"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: 'none', cursor: 'pointer',
          fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'white',
        }}>
        <SlidersHorizontal style={{ width: 13, height: 13 }} /> Personalizza
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 200,
          background: 'white', borderRadius: 10, border: '1px solid #dcd8cc', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#a9a18e' }}>Solo qui</span>
            <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#a9a18e' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
          {EXTRAS_LABELS.map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontFamily: FONT.body, fontSize: 12, color: '#4d4740', cursor: 'pointer' }}>
              <input type="checkbox" checked={extras[key]} onChange={e => onChange({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function DiarioReportPage({ report, photos, meta, extras, trackPoints, mapsInteractive, escNumber, maxPhotos = DIARY_MAX_PHOTOS_DEFAULT, selectedPhotoIds, onSelectedPhotosChange, yearBand, onExclude, onExtrasChange }: {
  report: DiaryReport; photos: RoutePhoto[]; meta?: ActivityMeta; extras: ReportExtras
  trackPoints?: TrackPoint[]; mapsInteractive: boolean; escNumber: number
  /** Tetto alle foto stampate nel Diario. Vedi DIARY_MAX_PHOTOS_DEFAULT. */
  maxPhotos?: number
  /** Foto scelte a mano; vuoto = selezione automatica distribuita. */
  selectedPhotoIds?: string[]
  onSelectedPhotosChange?: (ids: string[]) => void
  /** Presente solo sulla prima pagina di un nuovo anno — vedi DiarioYearDivider.tsx. */
  yearBand?: DiarioYearBandInfo
  /** Assenti = l'editing non è disponibile in questo contesto (es. cattura per il PDF). */
  onExclude?: () => void
  onExtrasChange?: (patch: Partial<ReportExtras>) => void
}) {
  const act = report.activity
  const sections = useMemo(() => parseSections(report.content).map(s => {
    const { clean, quotes } = extractCuriosita(s.body)
    return { title: s.title, body: clean, quotes }
  }), [report.content])
  const allQuotes  = useMemo(() => sections.flatMap(s => s.quotes), [sections])
  const pullQuote  = allQuotes[0]
  // Prima limitato a due (`.slice(1, 3)`): un resoconto con più di tre curiosità in tutto ne
  // perdeva il resto dal Diario, senza alcun avviso.
  const storyBoxes = allQuotes.slice(1)

  const escLabel = String(escNumber).padStart(2, '0')
  const dateStr  = act?.start_time
    ? format(new Date(act.start_time), 'd MMMM yyyy', { locale: it })
    : report.created_at ? format(new Date(report.created_at), 'd MMMM yyyy', { locale: it }) : ''
  const monthYear = act?.start_time ? format(new Date(act.start_time), 'MMMM yyyy', { locale: it }) : ''
  // Selezione distribuita lungo il percorso, non le prime N: prendere le prime racconterebbe solo
  // l'inizio del cammino.
  const diaryPhotos = useMemo(() => {
    const manual = selectedPhotoIds && selectedPhotoIds.length > 0
      ? photos.filter(p => selectedPhotoIds.includes(p.id))
      : null
    // La selezione manuale dice *quali foto pubblicare* — vale per il sito, che le mostra tutte.
    // Il PDF ne prende comunque al massimo `maxPhotos`, distribuite lungo il percorso: è un
    // documento impaginato, non una galleria.
    return selectSpreadPhotos(manual ?? photos, maxPhotos)
  }, [photos, maxPhotos, selectedPhotoIds])
  const heroPhoto = photos[0] ?? null
  const detailPhoto = photos[1] ?? null
  const weather = act?.weather_at_hike
  const weatherInfo = weather ? wmoInfo(weather.weathercode) : null
  const showMappa       = extras.mappa       && (meta?.routePolyline?.length ?? 0) > 1
  const showStatistiche = extras.statistiche && !!meta

  const tp = trackPoints ?? []
  const progress = useMemo(() => tp.length > 1 ? trackPointsProgress(tp) : [], [tp])
  const photoMarkers = useMemo(() => photos
    .filter(p => typeof p.progress === 'number')
    // DTREK-AUDIT.md P3 #35 — marker da 26px nel grafico (ProgressChart.tsx), non serve la foto intera
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

  const showGrafico  = extras.grafico  && altitudeSeries.length > 1
  const showCuore    = extras.cuore    && hrSeries.length > 1
  const showVelocita = extras.velocita && speedSeries.length > 1

  // Un resoconto le cui sezioni esistono ma sono tutte vuote (`## Titolo` senza testo sotto) non
  // ha una storia: nel PDF occupava due pagine intere con la fascia foto vuota e lo spazio del
  // racconto bianco. Per l'esportazione ne viene preparata una scheda compatta alternativa.
  const hasStory = sections.some(s => s.body.trim())
  const introSection = sections[0]
  // Un'intestazione senza corpo (sezione lasciata vuota nel resoconto sorgente) non va comunque
  // stampata: restava a schermo come un titolo isolato seguito da uno spazio bianco vuoto — nel
  // caso peggiore osservato, tre intestazioni consecutive senza una sola riga di testo sotto.
  const restSections = sections.slice(1).filter(s => s.body.trim())
  const STORY_ACCENTS = [
    { bg: '#fdf6ee', border: '#e08d3c', label: '#c05a17', text: '#6a2e18' },
    { bg: '#f1f8f2', border: '#378d44', label: '#277134', text: '#193b20' },
  ]

  return (
    <div className="diario-page"
      // Dichiarato per il ritaglio dell'esportazione per annata (vedi exportYear in app/diario).
      data-year={act?.start_time ? new Date(act.start_time).getFullYear() : undefined}
      style={{
      width: PDF_PAGE_W, minHeight: PDF_CONTENT_H, background: 'white', margin: '24px auto',
      boxShadow: '0 8px 56px rgba(0,0,0,0.28)', overflow: 'hidden', position: 'relative',
    }}>
      {yearBand && <DiarioYearBand {...yearBand} />}

      {onExtrasChange && <CustomizeExtras extras={extras} onChange={onExtrasChange} />}

      {onSelectedPhotosChange && photos.length > 0 && (
        <PhotoPicker photos={photos} selected={selectedPhotoIds ?? []} onChange={onSelectedPhotosChange} />
      )}

      {onExclude && (
        <button onClick={onExclude} className="diario-editor-control print:hidden"
          title="Escludi questa escursione dal diario"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', border: 'none', cursor: 'pointer',
            fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'white',
          }}>
          <EyeOff style={{ width: 13, height: 13 }} /> Escludi
        </button>
      )}

      {/* Apertura dell'articolo — l'unico pezzo che sta solo sulla prima pagina del pezzo.
          `data-mag="opening"` lo dichiara al compositore (lib/diaryMagazine.ts), che ne sottrae
          l'altezza a quella utile delle colonne della prima pagina.
          Il hero è sceso da 420 a 320 px: a 420 l'apertura completa mangiava 560 px su 1067, cioè
          più di metà pagina per una fotografia, e il testo scivolava su una terza pagina. */}
      <div data-mag="opening">
      <div style={{ height: 320, position: 'relative', overflow: 'hidden', background: heroPhoto ? undefined : 'linear-gradient(170deg,#0f2e1a 0%,#1b4332 30%,#193b20 62%,#0d1f12 100%)' }}>
        {heroPhoto && (
          <img src={heroPhoto.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {!heroPhoto && (
          <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', opacity: 0.1 }} viewBox="0 0 794 260" preserveAspectRatio="none">
            <path d="M0,260 L55,190 L115,225 L195,128 L278,172 L358,65 L418,118 L490,60 L558,108 L630,68 L704,105 L794,78 L794,260 Z" fill="white" />
          </svg>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 40%, transparent 25%, rgba(0,0,0,0.35) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, transparent 35%, rgba(0,0,0,0.72) 100%)' }} />

        <div style={{ position: 'absolute', top: 32, left: 48, right: 48 }}>
          <span style={{ fontFamily: FONT.barlow, fontSize: 11, fontWeight: 700, letterSpacing: 5, color: '#e08d3c', textTransform: 'uppercase' }}>
            Escursione #{escLabel}{monthYear ? ` · ${monthYear}` : ''}
          </span>
        </div>

        <div style={{ position: 'absolute', bottom: 32, left: 48, right: 48 }}>
          <h1 style={{ fontFamily: FONT.display, fontSize: 48, fontWeight: 700, color: 'white', lineHeight: 1.02, letterSpacing: -1, margin: '0 0 18px' }}>
            {report.title || act?.title || 'Escursione'}
          </h1>
          <div style={{ width: 56, height: 2, background: '#e08d3c' }} />
        </div>
      </div>

      {/* Stat strip — dark forest */}
      {act && (
        <div style={{ background: '#193b20', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: '▸ Distanza', value: act.distance_meters > 0 ? `${(act.distance_meters / 1000).toFixed(1)}` : '—', sub: 'km' },
            { label: '▲ Dislivello', value: act.elevation_gain > 0 ? `${Math.round(act.elevation_gain)}` : '—', sub: 'm D+' },
            { label: '◷ Durata', value: act.total_time_seconds > 0 ? formatDuration(act.total_time_seconds) : '—', sub: 'in movimento' },
            weatherInfo && weather
              ? { label: '◆ Meteo', value: `${Math.round(weather.temperature)}°C`, sub: weatherInfo.label }
              : { label: '◆ Calorie', value: meta?.calories ? `${meta.calories}` : '—', sub: 'kcal' },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '22px 28px', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
              <p style={{ fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 7px' }}>{s.label}</p>
              <p style={{ fontFamily: FONT.mono, fontSize: 26, fontWeight: 500, color: 'white', margin: 0, lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontFamily: FONT.body, fontSize: 10, color: 'rgba(255,255,255,0.38)', margin: '5px 0 0' }}>{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Date bar */}
      {dateStr && (
        <div style={{ background: '#f8f7f4', padding: '12px 48px', borderTop: '1px solid #dcd8cc' }}>
          <p style={{ fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#8a7f6e', textTransform: 'uppercase', margin: 0 }}>
            {dateStr}
          </p>
        </div>
      )}
      </div>

      {/* Scheda compatta per le escursioni senza racconto — vedi `hasStory` sopra.
          `display:none` perché il libro a schermo continua a mostrare la pagina intera: la scheda
          esiste solo per l'esportazione, dove il compositore (lib/diaryMagazine.ts) la scopre, la
          rende visibile e ne impila tre o quattro per pagina. */}
      {!hasStory && (
        <div data-mag="card" style={{ display: 'none', marginBottom: 22, border: '1px solid #dcd8cc', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 128 }}>
            {heroPhoto
              ? <img src={heroPhoto.url} alt="" style={{ width: 176, height: 128, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
              : <div style={{ width: 176, height: 128, flexShrink: 0, background: 'linear-gradient(170deg,#1b4332,#0d1f12)' }} />}
            <div style={{ padding: '16px 20px', flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 5px' }}>
                Escursione #{escLabel}{monthYear ? ` \u00b7 ${monthYear}` : ''}
              </p>
              <p style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 700, color: '#193b20', margin: '0 0 4px', lineHeight: 1.15 }}>
                {report.title || act?.title || 'Escursione'}
              </p>
              {dateStr && <p style={{ fontFamily: FONT.lora, fontSize: 11, color: '#a9a18e', margin: '0 0 10px' }}>{dateStr}</p>}
              {act && (
                <p style={{ fontFamily: FONT.mono, fontSize: 12, color: '#4d4740', margin: 0 }}>
                  {act.distance_meters > 0 ? `${(act.distance_meters / 1000).toFixed(1)} km` : '\u2014'}
                  {act.elevation_gain > 0 ? ` \u00b7 ${Math.round(act.elevation_gain)} m D+` : ''}
                  {act.total_time_seconds > 0 ? ` \u00b7 ${formatDuration(act.total_time_seconds)}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '48px 48px 40px' }}>
        <p style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 36px' }}>
          Cronaca · Escursione #{escLabel}
        </p>

        {/* Scheda editoriale + intro.
            I paragrafi non sono più troncati a 3 (vedi la nota sotto storyBoxes): un resoconto
            "lungo" ne ha facilmente il doppio, e prima sparivano dal Diario senza alcun avviso —
            pur essendo presenti per intero nel PDF del singolo resoconto. Il blocco non è più UN
            SOLO `.pdf-block`: ora lo sono titolo+primo paragrafo insieme (evita un titolo isolato
            in fondo a una pagina) e ogni paragrafo successivo per conto proprio, così un'intro
            lunga può proseguire su più pagine senza mai tagliare un paragrafo a metà. */}
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 36, marginBottom: 40 }}>
          <div className="pdf-block" data-mag-block="">
            <p style={{ fontFamily: FONT.barlow, fontSize: 8, fontWeight: 900, letterSpacing: 3, color: '#a9a18e', textTransform: 'uppercase', margin: '0 0 14px', paddingBottom: 9, borderBottom: '1.5px solid #e08d3c' }}>
              Scheda
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <SchedaField label="Escursione" value={`#${escLabel}`} />
              {dateStr && <SchedaField label="Periodo" value={dateStr} />}
              {!!meta?.altitudeMax && <SchedaField label="Quota massima" value={`${Math.round(meta.altitudeMax)} m`} />}
              {weatherInfo && weather && <SchedaField label="Meteo" value={`${weatherInfo.emoji} ${weatherInfo.label} · ${Math.round(weather.temperature)}°C`} />}
            </div>
          </div>

          <div>
            {/* Titolo sempre presente anche senza testo introduttivo: senza questo ramo, un
                resoconto con la prima sezione vuota perdeva anche il proprio titolo (viaggiava
                nello stesso .pdf-block del primo paragrafo, che qui non esiste). */}
            {(!introSection || !introSection.body.trim()) && (
              <div className="pdf-block" data-mag-block="">
                <h2 style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: '#193b20', lineHeight: 1.12, margin: 0, letterSpacing: -0.5 }}>
                  {report.title || act?.title || 'Escursione'}
                </h2>
              </div>
            )}
            {introSection && introSection.body.split(/\n\n+/).filter(p => p.trim()).map((p, j) => {
              const text = p.trim()
              const dropCap = j === 0 && text.length > 0
              const segments = parseInlineEmphasis(text)
              const first = segments[0]
              const paragraph = (
                <p style={{ fontFamily: FONT.lora, fontSize: 13.5, lineHeight: 1.85, color: '#4d4740', margin: '0 0 16px' }}>
                  {dropCap ? (
                    <>
                      <span style={{ float: 'left', fontSize: 52, lineHeight: 0.8, fontWeight: 700, color: '#e08d3c', padding: '4px 7px 0 0', fontFamily: FONT.display }}>
                        {first?.text[0] ?? ''}
                      </span>
                      {first?.bold
                        ? <strong style={{ fontWeight: 700 }}>{first.text.slice(1)}</strong>
                        : first?.text.slice(1)}
                      {segments.slice(1).map((seg, k) =>
                        seg.bold ? <strong key={k} style={{ fontWeight: 700 }}>{seg.text}</strong> : <span key={k}>{seg.text}</span>,
                      )}
                    </>
                  ) : renderInline(text)}
                </p>
              )
              // Il titolo viaggia col primo paragrafo nello stesso pdf-block, per non ritrovarsi
              // mai isolato in fondo a una pagina con tutto il testo rimandato alla successiva.
              return j === 0 ? (
                <div key={j} className="pdf-block" data-mag-block="">
                  <h2 style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: '#193b20', lineHeight: 1.12, margin: '0 0 24px', letterSpacing: -0.5 }}>
                    {report.title || act?.title || 'Escursione'}
                  </h2>
                  {paragraph}
                </div>
              ) : <div key={j} className="pdf-block" data-mag-block="">{paragraph}</div>
            })}
          </div>
        </div>

        {/* Pull quote */}
        {pullQuote && (
          <div className="pdf-block" data-mag-block="" style={{ margin: '0 -8px 40px', padding: '32px 40px', borderTop: '2px solid #193b20', borderBottom: '2px solid #193b20', position: 'relative' }}>
            <span style={{ position: 'absolute', top: -26, left: 36, fontFamily: FONT.display, fontSize: 70, lineHeight: 1, color: '#193b20', opacity: 0.12, userSelect: 'none' }}>&ldquo;</span>
            <p style={{ fontFamily: FONT.display, fontSize: 19, fontStyle: 'italic', lineHeight: 1.55, color: '#193b20', margin: 0 }}>
              {renderInline(pullQuote)}
            </p>
          </div>
        )}

        {/* Detail photo alongside remaining sections — stesso principio di sopra: titolo +
            primo paragrafo insieme, poi un pdf-block per ogni paragrafo successivo. */}
        <div style={{ display: 'grid', gridTemplateColumns: detailPhoto ? '1fr 164px' : '1fr', gap: 32, marginBottom: 32 }}>
          <div>
            {restSections.map((section, i) => (
              <div key={i} style={{ marginBottom: 22 }}>
                {section.body.split(/\n\n+/).filter(p => p.trim()).map((p, j) => {
                  const paragraph = (
                    <p style={{ fontFamily: FONT.lora, fontSize: 13.5, lineHeight: 1.85, color: '#4d4740', margin: '0 0 14px' }}>{renderInline(p.trim())}</p>
                  )
                  return j === 0 ? (
                    <div key={j} className="pdf-block" data-mag-block="">
                      <p style={{ fontFamily: FONT.barlow, fontSize: 10, fontWeight: 900, letterSpacing: 3, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 8px' }}>
                        {section.title}
                      </p>
                      {paragraph}
                    </div>
                  ) : <div key={j} className="pdf-block" data-mag-block="">{paragraph}</div>
                })}
              </div>
            ))}
          </div>
          {detailPhoto && (
            <div className="pdf-block" data-mag-block="">
              <div style={{ width: 164, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <img src={detailPhoto.url} alt={detailPhoto.caption} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)' }} />
                {detailPhoto.caption && (
                  <p style={{ position: 'absolute', bottom: 10, left: 10, right: 10, fontFamily: FONT.lora, fontSize: 9, fontStyle: 'italic', color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.4 }}>
                    {detailPhoto.caption}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Storytelling boxes.
            Prima "storyBoxes" era limitato a 2 (`allQuotes.slice(1,3)`, la prima riservata al pull
            quote sopra): un resoconto con più di 3 curiosità ne perdeva il resto senza avviso.
            Qui restano tutte, e ognuna è il proprio pdf-block — non più un unico blocco con
            l'intera lista dentro, che con molte curiosità avrebbe rischiato il taglio forzato a
            metà box. */}
        {storyBoxes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
            {storyBoxes.map((q, i) => {
              const acc = STORY_ACCENTS[i % STORY_ACCENTS.length]
              return (
                <div key={i} className="pdf-block" data-mag-block="" style={{ background: acc.bg, borderLeft: `3px solid ${acc.border}`, borderRadius: '0 6px 6px 0', padding: '18px 22px' }}>
                  <p style={{ fontFamily: FONT.lora, fontSize: 13, fontStyle: 'italic', lineHeight: 1.75, color: acc.text, margin: 0 }}>{renderInline(q)}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Dati & percorso.
            Prima un unico `.pdf-block` per statistiche+grafici+mappa insieme: sommati superano
            facilmente l'altezza di una pagina, e senza un confine di blocco che entri nello spazio
            rimasto il paginatore ripiegava sui riquadri di riga — l'unico testo di questo gruppo è
            il titolo "Il percorso", quindi il taglio cadeva subito sotto di esso, con la mappa
            (un'immagine, senza righe di testo proprie) spinta da sola sulla pagina successiva.
            Ora ogni scheda è il proprio blocco, così il paginatore può spostarne una intera alla
            pagina dopo invece di spezzarla; `pdf-keep-next` sul titolo mantiene "Il percorso"
            comunque agganciato alla mappa che lo segue. */}
        {showStatistiche && (
          <div className="pdf-block" data-mag-block="" data-mag-insert="" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
            <StatCard value={`${(meta!.distanceMeters / 1000).toFixed(1)} km`} label="Distanza" icon={<Route style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={`${Math.round(meta!.elevationGain)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={formatDuration(meta!.totalTimeSeconds)} label="Durata" icon={<Clock style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={meta!.calories ? `${meta!.calories}` : '—'} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
          </div>
        )}
        {showGrafico && (
          <div className="pdf-block" data-mag-block="" data-mag-insert="" style={{ marginBottom: 14 }}>
            <p style={{ fontFamily: FONT.barlow, fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
              Profilo altimetrico {photoMarkers.length > 0 && '· con posizione foto'}
            </p>
            <div style={{ background: GREEN.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${GREEN.border}` }}>
              <ProgressChart series={altitudeSeries} photoMarkers={photoMarkers} accent={GREEN} unit=" m" />
            </div>
          </div>
        )}
        {(showCuore || showVelocita) && (
          <div className="pdf-block" data-mag-block="" data-mag-insert="" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {showCuore && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONT.barlow, fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Frequenza cardiaca
                </p>
                <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 12px', border: '1px solid #fecaca' }}>
                  <ProgressChart series={hrSeries} accent={{ bg: '#fef2f2', border: '#fecaca', text: '#991b1b', iconBg: '#fee2e2', iconColor: '#dc2626' }} unit=" bpm" />
                </div>
              </div>
            )}
            {showVelocita && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONT.barlow, fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Velocità
                </p>
                <div style={{ background: BLUE.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${BLUE.border}` }}>
                  <ProgressChart series={speedSeries} accent={BLUE} unit=" km/h" decimals={1} />
                </div>
              </div>
            )}
          </div>
        )}
        {showMappa && (
          <div className="pdf-block" data-mag-block="" data-mag-insert="" style={{ marginBottom: 18 }}>
            <p className="pdf-keep-next" style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 700, color: '#193b20', margin: '0 0 12px' }}>Il percorso</p>
            {/* Inquadramento: la mappa del percorso dice com'è fatto il giro, questa dice dove sta.
                Senza, una traccia fra due boschi non dice a chi legge se è in Piemonte o in Puglia. */}
            {meta!.routePolyline!.length > 0 && (
              <div style={{ float: 'right', width: 84, marginLeft: 10, marginBottom: 6 }}>
                <LocatorMap eager lat={meta!.routePolyline![0][0]} lon={meta!.routePolyline![0][1]} label={meta!.title ?? undefined} />
              </div>
            )}
            <div className="print:hidden diario-report-map" data-activity-id={meta!.id} style={{ height: 260, borderRadius: 10, overflow: 'hidden', border: '1px solid #dcd8cc' }}>
              <LazyMount height={260} placeholder={<div style={{ height: '100%', background: '#f3f4f2' }} />}>
                <AllRoutesMap
                  routes={[{ id: meta!.id, title: meta!.title ?? 'Percorso', startTime: meta!.startTime, polyline: meta!.routePolyline! }]}
                  height="260px"
                  interactive={mapsInteractive}
                />
              </LazyMount>
            </div>
          </div>
        )}

        {/* Foto — ognuna un blocco a sé, non più un'unica griglia.
            La griglia era un solo blocco alto quanto tutte le foto insieme: più alto di una
            pagina, quindi il compositore lo piazzava comunque e l'impaginatore lo spezzava in due,
            lasciando una pagina con due foto e l'85% di bianco. Come blocchi singoli si
            distribuiscono nel racconto e riempiono le colonne. */}
        {diaryPhotos.length > 0 && (
          <>
            {diaryPhotos.map((ph, i) => (
              <div key={ph.id} className="pdf-block" data-mag-block="" data-mag-insert=""
                style={{ position: 'relative', marginBottom: 14 }}>
                <img src={ph.url} alt={ph.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }} />
                <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, background: '#e08d3c', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '20px', fontSize: 10, fontWeight: 'bold', fontFamily: FONT.body, display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i+1}</span>
                {ph.caption && <p style={{ fontSize: 9, color: '#73695c', textAlign: 'center', marginTop: 5, fontStyle: 'italic', fontFamily: FONT.lora }}>{ph.caption}</p>}
              </div>
            ))}
          </>
        )}

        {/* Page footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eeece5', paddingTop: 14 }}>
          <span style={{ fontFamily: FONT.body, fontSize: 9, letterSpacing: 3, color: '#c4bead', textTransform: 'uppercase' }}>{report.title || act?.title || 'Escursione'}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: '#c4bead' }}>{escLabel}</span>
        </div>
      </div>
    </div>
  )
}
