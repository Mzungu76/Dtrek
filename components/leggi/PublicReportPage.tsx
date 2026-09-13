// Pagina di un'escursione nel sito pubblico del Diario — stessa impaginazione a rivista del libro
// privato (components/diario/DiarioReportPage.tsx), voluta "pari pari" dall'utente dopo aver visto
// quella schermata: copertina scura, striscia di statistiche, colonna "Scheda", capolettera,
// citazione centrale, box curiosità, grafici, foto numerate.
//
// Due differenze deliberate rispetto all'originale, entrambe già commentate nel file da cui viene:
//  1. Nessun controllo di modifica (Personalizza/Escludi/scelta foto): quei pulsanti nel privato
//     sono già opzionali (props assenti = niente pulsante), qui semplicemente non esistono.
//  2. La mappa del percorso è quella statica del sito pubblico (RouteMap.tsx: tile OSM vere +
//     traccia SVG, zero JavaScript) invece del Leaflet interattivo del libro — nel libro stesso, in
//     lettura, quella mappa non è interattiva (`mapsInteractive=false`): stessa resa a schermo,
//     senza spedire un runtime di mappe a chi apre un link.
//  3. Le foto non sono capate a un tetto come nel PDF ("le foto non stampate restano tutte... sulla
//     pagina pubblica", commento originale) — qui compaiono tutte, non le sei che entrano in stampa.
//
// Componente SERVER: nessuno stato, nessun JavaScript spedito al browser.
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Route, Mountain, Clock, Flame } from 'lucide-react'
import { FONT } from '@/lib/designTokens'
import { PDF_PAGE_W } from '@/lib/pdfPageGeometry'
import { formatDuration } from '@/lib/tcxParser'
import { parseSections } from '@/lib/reportStore'
import { parseInlineEmphasis } from '@/lib/guideMarkup'
import { extractCuriosita } from '@/components/diario/chartUtils'
import { ProgressChart } from '@/components/diario/ProgressChart'
import { StatCard } from '@/components/diario/StatCard'
import { GREEN, BLUE } from '@/components/diario/types'
import { LocatorMap } from '@/components/LocatorMap'
import type { PublicDiaryEntry } from '@/lib/sharePublicDiary'
import type { DiaryPublicSections } from '@/lib/diaryConfig'
import { RouteMap, PoiCaption } from '@/app/leggi/d/[token]/RouteMap'

function renderInline(text: string) {
  return parseInlineEmphasis(text).map((seg, k) =>
    seg.bold ? <strong key={k} style={{ fontWeight: 700 }}>{seg.text}</strong> : <span key={k}>{seg.text}</span>,
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

const STORY_ACCENTS = [
  { bg: '#fdf6ee', border: '#e08d3c', label: '#c05a17', text: '#6a2e18' },
  { bg: '#f1f8f2', border: '#378d44', label: '#277134', text: '#193b20' },
]

export function PublicReportPage({ entry, n, show }: { entry: PublicDiaryEntry; n: number; show: DiaryPublicSections }) {
  const sections = parseSections(show.racconto ? entry.content : '').map(s => {
    const { clean, quotes } = extractCuriosita(s.body)
    return { title: s.title, body: clean, quotes }
  })
  const allQuotes = sections.flatMap(s => s.quotes)
  const pullQuote = allQuotes[0]
  const storyBoxes = allQuotes.slice(1)

  const escLabel = String(n).padStart(2, '0')
  const dateStr = format(new Date(entry.startTime), 'd MMMM yyyy', { locale: it })
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

  const photoMarkers = photos
    .map(p => p.progress).filter((p): p is number => p != null)

  return (
    <div id={`esc-${n}`} className="diario-page scroll-mt-14"
      style={{ width: PDF_PAGE_W, maxWidth: '100%', background: 'white', margin: '24px auto', boxShadow: '0 8px 56px rgba(0,0,0,0.28)', overflow: 'hidden', position: 'relative' }}>

      {/* Apertura */}
      <div style={{ height: 320, position: 'relative', overflow: 'hidden', background: heroPhoto ? undefined : 'linear-gradient(170deg,#0f2e1a 0%,#1b4332 30%,#193b20 62%,#0d1f12 100%)' }}>
        {heroPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto.url} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
            Escursione #{escLabel} · {monthYear}
          </span>
        </div>

        <div style={{ position: 'absolute', bottom: 32, left: 48, right: 48 }}>
          <h1 style={{ fontFamily: FONT.display, fontSize: 48, fontWeight: 700, color: 'white', lineHeight: 1.02, letterSpacing: -1, margin: '0 0 18px' }}>
            {entry.title}
          </h1>
          <div style={{ width: 56, height: 2, background: '#e08d3c' }} />
        </div>
      </div>

      {/* Striscia statistiche */}
      <div style={{ background: '#193b20', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {[
          { label: '▸ Distanza', value: entry.distanceMeters > 0 ? `${(entry.distanceMeters / 1000).toFixed(1)}` : '—', sub: 'km' },
          { label: '▲ Dislivello', value: entry.elevationGain > 0 ? `${Math.round(entry.elevationGain)}` : '—', sub: 'm D+' },
          { label: '◷ Durata', value: entry.totalTimeSeconds > 0 ? formatDuration(entry.totalTimeSeconds) : '—', sub: 'in movimento' },
          { label: '◆ Calorie', value: entry.calories ? `${entry.calories}` : '—', sub: 'kcal' },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: '22px 28px', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
            <p style={{ fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 7px' }}>{s.label}</p>
            <p style={{ fontFamily: FONT.mono, fontSize: 26, fontWeight: 500, color: 'white', margin: 0, lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontFamily: FONT.body, fontSize: 10, color: 'rgba(255,255,255,0.38)', margin: '5px 0 0' }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Data */}
      <div style={{ background: '#f8f7f4', padding: '12px 48px', borderTop: '1px solid #dcd8cc' }}>
        <p style={{ fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#8a7f6e', textTransform: 'uppercase', margin: 0 }}>
          {dateStr}
        </p>
      </div>

      <div style={{ padding: '48px 48px 40px' }}>
        <p style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 36px' }}>
          Cronaca · Escursione #{escLabel}
        </p>

        {/* Scheda + intro */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 170px) minmax(0, 1fr)', gap: 36, marginBottom: 40 }}>
          <div>
            <p style={{ fontFamily: FONT.barlow, fontSize: 8, fontWeight: 900, letterSpacing: 3, color: '#a9a18e', textTransform: 'uppercase', margin: '0 0 14px', paddingBottom: 9, borderBottom: '1.5px solid #e08d3c' }}>
              Scheda
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <SchedaField label="Escursione" value={`#${escLabel}`} />
              <SchedaField label="Periodo" value={dateStr} />
              {!!entry.altitudeMax && <SchedaField label="Quota massima" value={`${Math.round(entry.altitudeMax)} m`} />}
            </div>
          </div>

          <div>
            {(!introSection || !introSection.body.trim()) && (
              <h2 style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: '#193b20', lineHeight: 1.12, margin: 0, letterSpacing: -0.5 }}>
                {entry.title}
              </h2>
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
                      {first?.bold ? <strong style={{ fontWeight: 700 }}>{first.text.slice(1)}</strong> : first?.text.slice(1)}
                      {segments.slice(1).map((seg, k) =>
                        seg.bold ? <strong key={k} style={{ fontWeight: 700 }}>{seg.text}</strong> : <span key={k}>{seg.text}</span>,
                      )}
                    </>
                  ) : renderInline(text)}
                </p>
              )
              return j === 0 ? (
                <div key={j}>
                  <h2 style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 700, color: '#193b20', lineHeight: 1.12, margin: '0 0 24px', letterSpacing: -0.5 }}>
                    {entry.title}
                  </h2>
                  {paragraph}
                </div>
              ) : <div key={j}>{paragraph}</div>
            })}
          </div>
        </div>

        {/* Citazione centrale */}
        {pullQuote && (
          <div style={{ margin: '0 -8px 40px', padding: '32px 40px', borderTop: '2px solid #193b20', borderBottom: '2px solid #193b20', position: 'relative' }}>
            <span style={{ position: 'absolute', top: -26, left: 36, fontFamily: FONT.display, fontSize: 70, lineHeight: 1, color: '#193b20', opacity: 0.12, userSelect: 'none' }}>&ldquo;</span>
            <p style={{ fontFamily: FONT.display, fontSize: 19, fontStyle: 'italic', lineHeight: 1.55, color: '#193b20', margin: 0 }}>
              {renderInline(pullQuote)}
            </p>
          </div>
        )}

        {/* Resto del racconto + foto di dettaglio */}
        <div style={{ display: 'grid', gridTemplateColumns: detailPhoto ? 'minmax(0, 1fr) minmax(90px, 164px)' : 'minmax(0, 1fr)', gap: 32, marginBottom: 32 }}>
          <div>
            {restSections.map((section, i) => (
              <div key={i} style={{ marginBottom: 22 }}>
                {section.body.split(/\n\n+/).filter(p => p.trim()).map((p, j) => {
                  const paragraph = (
                    <p style={{ fontFamily: FONT.lora, fontSize: 13.5, lineHeight: 1.85, color: '#4d4740', margin: '0 0 14px' }}>{renderInline(p.trim())}</p>
                  )
                  return j === 0 ? (
                    <div key={j}>
                      <p style={{ fontFamily: FONT.barlow, fontSize: 10, fontWeight: 900, letterSpacing: 3, color: '#e08d3c', textTransform: 'uppercase', margin: '0 0 8px' }}>
                        {section.title}
                      </p>
                      {paragraph}
                    </div>
                  ) : <div key={j}>{paragraph}</div>
                })}
              </div>
            ))}
          </div>
          {detailPhoto && (
            <div style={{ width: 164, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={detailPhoto.url} alt={detailPhoto.caption ?? ''} loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)' }} />
              {detailPhoto.caption && (
                <p style={{ position: 'absolute', bottom: 10, left: 10, right: 10, fontFamily: FONT.lora, fontSize: 9, fontStyle: 'italic', color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.4 }}>
                  {detailPhoto.caption}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Box curiosità */}
        {storyBoxes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
            {storyBoxes.map((q, i) => {
              const acc = STORY_ACCENTS[i % STORY_ACCENTS.length]
              return (
                <div key={i} style={{ background: acc.bg, borderLeft: `3px solid ${acc.border}`, borderRadius: '0 6px 6px 0', padding: '18px 22px' }}>
                  <p style={{ fontFamily: FONT.lora, fontSize: 13, fontStyle: 'italic', lineHeight: 1.75, color: acc.text, margin: 0 }}>{renderInline(q)}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Dati e percorso */}
        {showStatistiche && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
            <StatCard value={`${(entry.distanceMeters / 1000).toFixed(1)} km`} label="Distanza" icon={<Route style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={`${Math.round(entry.elevationGain)} m`} label="Dislivello D+" icon={<Mountain style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={formatDuration(entry.totalTimeSeconds)} label="Durata" icon={<Clock style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
            <StatCard value={entry.calories ? `${entry.calories}` : '—'} label="Calorie (kcal)" icon={<Flame style={{ color: GREEN.iconColor, width: 12, height: 12 }} />} accent={GREEN} />
          </div>
        )}
        {showGrafico && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontFamily: FONT.barlow, fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
              Profilo altimetrico
            </p>
            <div style={{ background: GREEN.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${GREEN.border}` }}>
              <ProgressChart series={entry.altitudeSeries} accent={GREEN} unit=" m" />
            </div>
          </div>
        )}
        {(showCuore || showVelocita) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
            {showCuore && (
              <div>
                <p style={{ fontFamily: FONT.barlow, fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Frequenza cardiaca
                </p>
                <div style={{ background: '#fef2f2', borderRadius: 8, padding: '10px 12px', border: '1px solid #fecaca' }}>
                  <ProgressChart series={entry.hrSeries} accent={{ bg: '#fef2f2', border: '#fecaca', text: '#991b1b', iconBg: '#fee2e2', iconColor: '#dc2626' }} unit=" bpm" />
                </div>
              </div>
            )}
            {showVelocita && (
              <div>
                <p style={{ fontFamily: FONT.barlow, fontSize: 9, color: '#a9a18e', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' }}>
                  Velocità
                </p>
                <div style={{ background: BLUE.bg, borderRadius: 8, padding: '10px 12px', border: `1px solid ${BLUE.border}` }}>
                  <ProgressChart series={entry.speedSeriesKmh} accent={BLUE} unit=" km/h" decimals={1} />
                </div>
              </div>
            )}
          </div>
        )}
        {showMappa && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 700, color: '#193b20', margin: '0 0 12px' }}>Il percorso</p>
            <div style={{ float: 'right', width: 84, marginLeft: 10, marginBottom: 6 }}>
              <LocatorMap eager lat={entry.polyline![0][0]} lon={entry.polyline![0][1]} label={entry.title} />
            </div>
            <RouteMap polyline={entry.polyline!} photoProgress={photoMarkers} pois={entry.pois} />
            <div style={{ clear: 'both' }} />
            <PoiCaption pois={entry.pois} />
          </div>
        )}

        {/* Foto */}
        {galleryPhotos.length > 0 && (
          <div style={{ marginTop: 18 }}>
            {galleryPhotos.map((ph, i) => (
              <div key={ph.id} style={{ position: 'relative', marginBottom: 14 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={ph.caption ?? ''} loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }} />
                <span style={{ position: 'absolute', top: 6, left: 6, width: 20, height: 20, background: '#e08d3c', color: 'white', borderRadius: '50%', textAlign: 'center', lineHeight: '20px', fontSize: 10, fontWeight: 'bold', fontFamily: FONT.body, display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i + 1}</span>
                {ph.caption && <p style={{ fontSize: 9, color: '#73695c', textAlign: 'center', marginTop: 5, fontStyle: 'italic', fontFamily: FONT.lora }}>{ph.caption}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Piede pagina */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eeece5', paddingTop: 14 }}>
          <span style={{ fontFamily: FONT.body, fontSize: 9, letterSpacing: 3, color: '#c4bead', textTransform: 'uppercase' }}>{entry.title}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 9, color: '#c4bead' }}>{escLabel}</span>
        </div>
      </div>
    </div>
  )
}
