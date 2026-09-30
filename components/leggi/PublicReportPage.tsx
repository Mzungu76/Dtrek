// Pagina di un'escursione nel sito pubblico del Diario — stessa identità di pagina-rivista
// stampabile del libro privato (components/diario/DiarioReportPage.tsx): copertina scura, striscia
// di statistiche, capolettera, citazione centrale, box curiosità, grafici, foto numerate. Non più
// una pagina web a tutto schermo: un vero foglio, come nell'app — larghezza fissa (794px, la stessa
// di PDF_PAGE_W) scalata proporzionalmente al contenitore con le CSS Container Queries (`cqw`),
// l'equivalente in puro CSS del `transform: scale()` che il libro privato calcola in JavaScript.
// Zero JavaScript spedito al browser: qui non c'è un client che misuri la larghezza, la scala la
// calcola il motore CSS stesso in base alla larghezza del contenitore — un vero foglio A4 in
// miniatura sul telefono, la stessa pagina più grande su un monitor, mai una colonna di testo a
// tutta larghezza.
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
import { metaHasHikingMetrics } from '@/lib/metaTypes'
import { reportFacts, reportNoun } from '@/lib/reportFacts'
import type { DiaryPublicSections } from '@/lib/diaryConfig'
import { RouteMap, PoiCaption } from '@/app/leggi/d/[token]/RouteMap'
import { PhotoRouteMap } from '@/app/leggi/d/[token]/PhotoRouteMap'

// Il foglio è disegnato a 794px (PDF_PAGE_W, la stessa unità del libro privato) e ogni misura
// fissa del disegno originale passa da qui — `cq(32)` è "32px alla larghezza di disegno 794px",
// espresso come percentuale della larghezza del CONTENITORE (`cqw`): quando il contenitore si
// allarga o si stringe, ogni misura cresce o si restringe insieme a tutte le altre, proprio come
// uno zoom sulla stessa pagina — mai una ricomposizione del layout in colonne diverse.
const PAGE_W = 794
function cq(px: number): string {
  return `${+(px / PAGE_W * 100).toFixed(3)}cqw`
}

function renderInline(text: string) {
  return parseInlineEmphasis(text).map((seg, k) =>
    seg.bold ? <strong key={k} style={{ fontWeight: 600 }}>{seg.text}</strong> : <span key={k}>{seg.text}</span>,
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
  // Un Sentiero ha cifre di cammino (km/D+/quota); un Borgo/Città o un Sito no — stessa scelta del
  // Reportage privato (lib/reportFacts.ts), mai una riga di trattini o "0.0 km".
  const hiking = metaHasHikingMetrics(entry.metaType)
  const noun = reportNoun(entry.metaType)
  const facts = reportFacts({
    metaType: entry.metaType, siteType: entry.siteType, totalTimeSeconds: entry.totalTimeSeconds,
    stopsCount: entry.stopsCount,
  })
  const dateStr = formatPublicDate(entry.startTime, hideExactDates)
  const monthYear = format(new Date(entry.startTime), 'MMMM yyyy', { locale: it })

  const photos = show.foto ? entry.photos : []
  // Senza foto proprie un Reportage di Sito apre con l'immagine del luogo.
  const heroPhoto = photos[0] ?? (entry.siteCoverUrl ? { url: entry.siteCoverUrl } : null)
  const detailPhoto = photos[1] ?? null
  const galleryPhotos = photos.slice(2)

  const introSection = sections[0]
  const restSections = sections.slice(1).filter(s => s.body.trim())

  // Entrambe devono essere vere: l'interruttore del Diario/Raccolta E quello di questo singolo
  // Reportage (entry.extras, lib/diaryConfig.ts) — "il più restrittivo vince", stesso principio già
  // usato per le altre preferenze di pubblicazione.
  const showStatistiche = show.statistiche && entry.extras.statistiche
  const showGrafico  = show.grafici && entry.extras.grafico   && entry.altitudeSeries.length > 1
  const showCuore    = show.grafici && entry.extras.cuore     && entry.hrSeries.length > 1
  const showVelocita = show.grafici && entry.extras.velocita  && entry.speedSeriesKmh.length > 1
  const showMappa    = show.percorso && entry.extras.mappa && !!entry.polyline && entry.polyline.length > 1

  // Foto con una posizione nota lungo il percorso — per la loro mappa a sé (PhotoRouteMap.tsx), non
  // per quella del percorso/POI qui sopra: vedi il commento in cima a RouteMap.tsx sul perché sono
  // due mappe distinte invece di una sola più affollata.
  const photosWithProgress = photos
    .filter((p): p is typeof p & { progress: number } => p.progress != null)
    .map(p => ({ url: p.url, progress: p.progress }))
  const showFotoMappa = showMappa && photosWithProgress.length > 0

  return (
    // Sfondo neutro dietro il foglio — non più bianco a bordo pagina: il bordo/ombra del foglio
    // deve vedersi anche sul telefono, non solo da tablet in su.
    <article id={`esc-${n}`} className="scroll-mt-14 bg-stone-200 px-2.5 sm:px-4 py-4">
      {/* Il foglio: 794px "di disegno", largo quanto il contenitore lo permette (fino a un tetto
          ragionevole), mai a bordo schermo — sempre un vero foglio, anche sul telefono. */}
      <div
        className="mx-auto bg-white overflow-hidden"
        style={{
          containerType: 'inline-size',
          width: 'min(100%, 1070px)',
          boxShadow: '0 8px 56px rgba(0,0,0,0.22)',
          borderRadius: cq(3),
        }}
      >
        {/* Apertura */}
        <div className="relative overflow-hidden" style={{
          height: cq(320),
          background: heroPhoto ? undefined : 'linear-gradient(170deg,#0f2e1a 0%,#1b4332 30%,#193b20 62%,#0d1f12 100%)',
        }}>
          {heroPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroPhoto.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 25%, rgba(0,0,0,0.35) 100%)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, transparent 35%, rgba(0,0,0,0.72) 100%)' }} />

          <div className="absolute" style={{ top: cq(32), left: cq(48), right: cq(48) }}>
            <span className="font-barlow" style={{ fontWeight: 700, fontSize: cq(11), letterSpacing: cq(5), color: '#e08d3c', textTransform: 'uppercase' }}>
              {noun} #{escLabel} · {monthYear}
            </span>
          </div>

          <div className="absolute" style={{ bottom: cq(32), left: cq(48), right: cq(48) }}>
            <h1 className="font-display" style={{ fontWeight: 700, color: '#fff', lineHeight: 1.02, letterSpacing: cq(-1), fontSize: cq(48), margin: `0 0 ${cq(18)}`, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
              {entry.title}
            </h1>
            <div style={{ width: cq(56), height: cq(2), background: '#e08d3c' }} />
          </div>
        </div>

        {/* Striscia statistiche — sempre 4 colonne, come sul foglio stampato: si rimpicciolisce
            insieme al resto, non si reimpagina mai in 2. */}
        {(hiking || facts.length > 0) && <div style={{ background: '#193b20', display: 'grid', gridTemplateColumns: `repeat(${hiking ? 4 : facts.length}, 1fr)` }}>
          {(hiking ? [
            { label: 'Distanza', value: entry.distanceMeters > 0 ? `${(entry.distanceMeters / 1000).toFixed(1)}` : '—', sub: 'km' },
            { label: 'Dislivello', value: entry.elevationGain > 0 ? `${Math.round(entry.elevationGain)}` : '—', sub: 'm D+' },
            { label: 'Durata', value: entry.totalTimeSeconds > 0 ? formatDuration(entry.totalTimeSeconds) : '—', sub: 'in movimento' },
            { label: 'Calorie', value: entry.calories ? `${entry.calories}` : '—', sub: 'kcal' },
          ] : facts.map(f => ({ label: f.label, value: f.value, sub: '' }))).map((s, i, arr) => (
            <div key={s.label} style={{ padding: `${cq(22)} ${cq(28)}`, borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
              <p className="font-barlow" style={{ fontWeight: 700, fontSize: cq(10), letterSpacing: cq(3), color: '#e08d3c', textTransform: 'uppercase', margin: `0 0 ${cq(7)}` }}>{s.label}</p>
              <p className="font-mono" style={{ fontWeight: 500, color: '#fff', margin: 0, lineHeight: 1, fontSize: cq(26) }}>{s.value}</p>
              <p style={{ fontSize: cq(10), color: 'rgba(255,255,255,0.4)', margin: `${cq(5)} 0 0` }}>{s.sub}</p>
            </div>
          ))}
        </div>}

        {/* Data */}
        <div style={{ background: '#f8f7f4', padding: `${cq(12)} ${cq(48)}`, borderTop: '1px solid #dcd8cc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: cq(12) }}>
          <p className="font-barlow" style={{ fontWeight: 700, fontSize: cq(10), letterSpacing: cq(3), color: '#8a7f6e', textTransform: 'uppercase', margin: 0 }}>
            {dateStr}{hiking && !!entry.altitudeMax && ` · Quota max ${Math.round(entry.altitudeMax)} m`}
          </p>
          {/* Solo per un'Attività nata dal ripiego "registra comunque" del check-in GPS di un Sito
              (lib/visitCompletion.ts) — mai un giudizio sul racconto, solo un'etichetta onesta sulla
              presenza reale che lo ha originato. */}
          {!entry.verified && (
            <p className="font-barlow" style={{ fontWeight: 700, fontSize: cq(10), letterSpacing: cq(2), color: '#a15c00', textTransform: 'uppercase', margin: 0, whiteSpace: 'nowrap' }}>
              Visita non verificata
            </p>
          )}
        </div>

        <div style={{ padding: `${cq(48)} ${cq(48)} ${cq(40)}` }}>
          <p className="font-barlow" style={{ fontWeight: 700, fontSize: cq(9), letterSpacing: cq(4), color: '#e08d3c', textTransform: 'uppercase', margin: `0 0 ${cq(36)}` }}>
            Cronaca · {noun} #{escLabel}
          </p>

          {/* Scheda editoriale + intro — griglia fissa 170px+1fr, la stessa del libro privato */}
          <div style={{ display: 'grid', gridTemplateColumns: `${cq(170)} 1fr`, gap: cq(36), marginBottom: cq(40) }}>
            <div>
              <p className="font-barlow" style={{ fontWeight: 900, fontSize: cq(8), letterSpacing: cq(3), color: '#a9a18e', textTransform: 'uppercase', margin: `0 0 ${cq(14)}`, paddingBottom: cq(9), borderBottom: `${cq(1.5)} solid #e08d3c` }}>
                Scheda
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: cq(13) }}>
                <SchedaField label={noun} value={`#${escLabel}`} />
                {dateStr && <SchedaField label="Periodo" value={dateStr} />}
                {hiking && !!entry.altitudeMax && <SchedaField label="Quota massima" value={`${Math.round(entry.altitudeMax)} m`} />}
              </div>
            </div>

            <div>
              {(!introSection || !introSection.body.trim()) && (
                <h2 className="font-display" style={{ fontWeight: 700, color: '#193b20', lineHeight: 1.12, margin: 0, letterSpacing: cq(-0.5), fontSize: cq(32) }}>
                  {entry.title}
                </h2>
              )}
              {introSection && introSection.body.split(/\n\n+/).filter(p => p.trim()).map((p, j) => {
                const text = p.trim()
                const dropCap = j === 0 && text.length > 0
                const segments = parseInlineEmphasis(text)
                const first = segments[0]
                const paragraph = (
                  <p className="font-lora" style={{ fontSize: cq(13.5), lineHeight: 1.85, color: '#4d4740', margin: `0 0 ${cq(16)}` }}>
                    {dropCap ? (
                      <>
                        <span className="font-display" style={{ float: 'left', lineHeight: 0.8, fontWeight: 700, color: '#e08d3c', padding: `${cq(4)} ${cq(7)} 0 0`, fontSize: cq(52) }}>
                          {first?.text[0] ?? ''}
                        </span>
                        {first?.bold ? <strong style={{ fontWeight: 600 }}>{first.text.slice(1)}</strong> : first?.text.slice(1)}
                        {segments.slice(1).map((seg, k) =>
                          seg.bold ? <strong key={k} style={{ fontWeight: 600 }}>{seg.text}</strong> : <span key={k}>{seg.text}</span>,
                        )}
                      </>
                    ) : renderInline(text)}
                  </p>
                )
                return j === 0 ? (
                  <div key={j}>
                    <h2 className="font-display" style={{ fontWeight: 700, color: '#193b20', lineHeight: 1.12, letterSpacing: cq(-0.5), fontSize: cq(32), margin: `0 0 ${cq(24)}` }}>
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
            <div style={{ margin: `0 ${cq(-8)} ${cq(40)}`, padding: `${cq(32)} ${cq(40)}`, borderTop: `${cq(2)} solid #193b20`, borderBottom: `${cq(2)} solid #193b20`, position: 'relative' }}>
              <span className="font-display" style={{ position: 'absolute', top: cq(-26), left: cq(36), fontSize: cq(70), lineHeight: 1, color: '#193b20', opacity: 0.12, userSelect: 'none' }}>&ldquo;</span>
              <p className="font-display" style={{ fontStyle: 'italic', lineHeight: 1.55, color: '#193b20', margin: 0, fontSize: cq(19) }}>
                {renderInline(pullQuote)}
              </p>
            </div>
          )}

          {/* Resto del racconto, con la foto di dettaglio nella sua colonna stretta — sempre
              affiancata, mai flottante dentro il testo: è così anche nel libro privato. */}
          <div style={{ display: 'grid', gridTemplateColumns: detailPhoto ? `1fr ${cq(164)}` : '1fr', gap: cq(32), marginBottom: cq(32) }}>
            <div>
              {restSections.map((section, i) => (
                <div key={i} style={{ marginBottom: cq(22) }}>
                  {section.body.split(/\n\n+/).filter(p => p.trim()).map((p, j) => {
                    const paragraph = (
                      <p className="font-lora" style={{ fontSize: cq(13.5), lineHeight: 1.85, color: '#4d4740', margin: `0 0 ${cq(14)}` }}>{renderInline(p.trim())}</p>
                    )
                    return j === 0 ? (
                      <div key={j}>
                        <p className="font-barlow" style={{ fontWeight: 900, fontSize: cq(10), letterSpacing: cq(3), color: '#e08d3c', textTransform: 'uppercase', margin: `0 0 ${cq(8)}` }}>
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
              <div style={{ position: 'relative', borderRadius: cq(4), overflow: 'hidden', alignSelf: 'start' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detailPhoto.url} alt={detailPhoto.caption ?? ''} loading="lazy" decoding="async" style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)' }} />
                {detailPhoto.caption && (
                  <p className="font-lora" style={{ position: 'absolute', bottom: cq(10), left: cq(10), right: cq(10), fontStyle: 'italic', color: 'rgba(255,255,255,0.88)', margin: 0, lineHeight: 1.4, fontSize: cq(9) }}>
                    {detailPhoto.caption}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Box curiosità */}
          {storyBoxes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: cq(12), marginBottom: cq(36) }}>
              {storyBoxes.map((q, i) => {
                const acc = STORY_ACCENTS[i % STORY_ACCENTS.length]
                return (
                  <div key={i} style={{ background: acc.bg, borderLeft: `${cq(3)} solid ${acc.border}`, borderRadius: `0 ${cq(6)} ${cq(6)} 0`, padding: `${cq(18)} ${cq(22)}` }}>
                    <p className="font-lora" style={{ fontStyle: 'italic', lineHeight: 1.75, margin: 0, color: acc.text, fontSize: cq(13) }}>{renderInline(q)}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Dati e percorso — StatCard/ProgressChart restano alla loro dimensione abituale
              (componenti condivisi con altre schermate, non riscalati qui). */}
          {showStatistiche && hiking && (
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
          {/* Reportage di Sito: il punto del luogo (mai quello della registrazione) su un riquadro d'Italia. */}
          {show.percorso && entry.extras.mappa && entry.sitePoint && !showMappa && (
            <div className="mb-5">
              <p className="font-display font-bold text-forest-900 text-lg mb-3">Dove si trova</p>
              <div className="w-32">
                <LocatorMap eager lat={entry.sitePoint.lat} lon={entry.sitePoint.lon} label={entry.title} />
              </div>
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

          {/* Foto — una griglia fissa a 2 colonne come una pagina stampata, non una colonna
              singola che si allarga: cresce e si rimpicciolisce con tutto il resto del foglio. */}
          {galleryPhotos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: cq(14), marginTop: cq(16) }}>
              {galleryPhotos.map((ph, i) => (
                <div key={ph.id} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ph.url} alt={ph.caption ?? ''} loading="lazy" decoding="async"
                    style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: cq(8), boxShadow: '0 4px 14px rgba(0,0,0,0.12)', display: 'block' }} />
                  <span style={{
                    position: 'absolute', top: cq(6), left: cq(6), width: cq(20), height: cq(20), background: '#e08d3c', color: '#fff',
                    borderRadius: '50%', textAlign: 'center', lineHeight: cq(20), fontSize: cq(10), fontWeight: 700, border: `${cq(1)} solid #fff`,
                  }}>{i + 1}</span>
                  {ph.caption && (
                    <p className="font-lora" style={{ fontSize: cq(9), color: '#73695c', textAlign: 'center', marginTop: cq(5), fontStyle: 'italic' }}>{ph.caption}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Piede pagina */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eeece5', paddingTop: cq(14), marginTop: cq(32) }}>
            <span style={{ fontSize: cq(9), letterSpacing: cq(3), color: '#c4bead', textTransform: 'uppercase' }}>{entry.title}</span>
            <span className="font-mono" style={{ fontSize: cq(9), color: '#c4bead' }}>{escLabel}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

function SchedaField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div>
        <p style={{ fontSize: cq(7.5), fontWeight: 600, letterSpacing: cq(2), color: '#a9a18e', textTransform: 'uppercase', margin: `0 0 ${cq(3)}` }}>{label}</p>
        <p className="font-lora" style={{ fontSize: cq(13), color: '#2c2520', margin: 0 }}>{value}</p>
      </div>
      <div style={{ height: 1, background: '#eeece5' }} />
    </>
  )
}
