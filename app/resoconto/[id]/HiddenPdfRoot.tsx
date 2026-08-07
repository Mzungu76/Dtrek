import { FONT, STONE, INK, HAIRLINE } from '@/lib/designTokens'
import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { Section } from '@/lib/reportStore'
import type { PoiItem } from '@/lib/overpass'
import { POI_META } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import { formatDuration } from '@/lib/tcxParser'
import { buildElevationSvgPath, downsampleSeries } from '@/lib/elevationSvgPath'
import { narrativeStyleFor } from '@/components/resoconto/sectionStyle'
import { slotFor } from './sectionPhotoSlot'

function distLabel(m: number): string {
  return m < 1000 ? `${m.toFixed(0)} m` : `${(m / 1000).toFixed(1)} km`
}

// Off-screen layout, montato solo al momento della cattura (vedi renderReportPdf.ts) — non più
// permanentemente nel DOM di ReportReader: prima ogni foto veniva scaricata due volte, una per la
// vista a schermo e una per questa, sempre montata anche quando non si stava esportando nulla.
export function HiddenPdfRoot({ activity, heroPhoto, dateStr, sections, photos, mapImage, poiWikiEntries }: {
  activity: StoredActivity; heroPhoto: RoutePhoto | null; dateStr: string
  sections: Section[]; photos: RoutePhoto[]
  /** Mappa già resa (MapLibre, vedi lib/mapSnapshot.ts) — la parte che richiede un rendering
   *  asincrono, calcolata dal chiamante prima del mount: qui è solo un `<img>`. */
  mapImage?: string
  poiWikiEntries?: { poi: PoiItem; wiki: WikiPage }[]
}) {
  const altSeries = downsampleSeries(
    activity.trackPoints.map(p => p.altitudeMeters).filter((a): a is number => a !== undefined),
    140,
  )
  const hasProfile = altSeries.length > 3

  const statPills: { label: string; value: string }[] = [
    { label: 'Distanza',   value: `${(activity.distanceMeters / 1000).toFixed(1)} km` },
    { label: 'Dislivello', value: `${Math.round(activity.elevationGain)} m` },
    { label: 'Durata',     value: formatDuration(activity.totalTimeSeconds) },
    { label: 'Quota max',  value: `${Math.round(activity.altitudeMax)} m` },
  ]
  if (activity.avgSpeedMs > 0) statPills.push({ label: 'Passo medio', value: `${(activity.avgSpeedMs * 3.6).toFixed(1)} km/h` })
  if (activity.calories > 0)   statPills.push({ label: 'Calorie',     value: `${Math.round(activity.calories)} kcal` })

  return (
    <div id="resoconto-print-root"
      style={{ position: 'fixed', left: '-9999px', top: 0, width: 794, background: 'white', fontFamily: FONT.body }}>
      {/* Hero */}
      <div className="pdf-block" style={{ position: 'relative', width: '100%', height: 220, overflow: 'hidden', marginBottom: 0 }}>
        {heroPhoto
          ? <img src={heroPhoto.url} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#193b20,#277134)' }} />
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(31,22,15,0.7) 0%, transparent 60%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 32px' }}>
          <h1 style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 700, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
            {activity.title ?? activity.notes ?? 'Escursione'}
          </h1>
          {dateStr && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '4px 0 0', fontStyle: 'italic' }}>{dateStr}</p>}
        </div>
      </div>

      <div style={{ padding: '24px 32px 0' }}>
        {/* Statistiche — prima assenti dal PDF, solo nell'intestazione a pillole minime */}
        <div className="pdf-block" style={{
          display: 'grid', gridTemplateColumns: `repeat(${statPills.length}, 1fr)`,
          borderTop: `0.5px solid ${HAIRLINE}`, borderBottom: `0.5px solid ${HAIRLINE}`, marginBottom: 20,
        }}>
          {statPills.map((s, i) => (
            <div key={s.label} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '12px 4px',
              borderRight: i < statPills.length - 1 ? `0.5px solid ${HAIRLINE}` : 'none',
            }}>
              <span style={{ fontFamily: FONT.barlow, fontSize: 17, fontWeight: 700, color: INK }}>{s.value}</span>
              <span style={{ fontFamily: FONT.barlow, fontSize: 7.5, fontWeight: 600, color: STONE[500], letterSpacing: 1.2, textTransform: 'uppercase' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Mappa del percorso — prima assente dal PDF: un racconto escursionistico senza traccia */}
        {mapImage && (
          <div className="pdf-block" style={{ marginBottom: 20 }}>
            <img src={mapImage} alt="Mappa del percorso" style={{ width: '100%', height: 300, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
          </div>
        )}

        {/* Profilo altimetrico — stessa forma SVG della Guida (lib/elevationSvgPath.ts) */}
        {hasProfile && (() => {
          const { line, area } = buildElevationSvgPath(altSeries)
          return (
            <div className="pdf-block" style={{
              background: STONE[50], border: `0.5px solid ${HAIRLINE}`, borderRadius: 4,
              padding: '10px 14px 8px', marginBottom: 20,
            }}>
              <svg viewBox="0 0 680 100" style={{ width: '100%', height: 90, display: 'block' }}>
                <path d={area} fill="#27713433" />
                <path d={line} fill="none" stroke="#277134" strokeWidth={2} />
              </svg>
              <p style={{ fontFamily: FONT.barlow, fontSize: 8, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: STONE[400], textAlign: 'center', margin: '4px 0 0' }}>
                Profilo altimetrico
              </p>
            </div>
          )
        })()}

        {/* Racconto */}
        {sections.map((section, i) => {
          const slot = slotFor(section.title, i)
          const sectionPhoto = photos[slot]
          const { color } = narrativeStyleFor(i)
          const paragraphs = section.body.split(/\n\n+/).map(p => p.replace(/\[curiosita\]|\[\/curiosita\]/g, '').trim()).filter(Boolean)
          return (
            <div key={i} style={{ marginBottom: 24 }}>
              <div className="pdf-block" style={{ background: color, padding: '6px 16px', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: FONT.barlow, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 14, fontFamily: FONT.display, fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: 1 }}>{section.title}</span>
              </div>
              <div style={{ padding: '14px 16px 4px', background: '#fff', border: `1px solid ${HAIRLINE}`, borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                {/* Niente più `float`: una card foto senza `overflow`/`flow-root` nel genitore
                    faceva sfondare la foto dal bordo e non contribuiva all'altezza del blocco,
                    così il punto di taglio calcolato dal paginatore cadeva sopra la foto e la
                    tagliava fra due pagine (B17). Riga flessibile: la foto contribuisce sempre
                    all'altezza reale, qualunque sia la lunghezza del testo accanto. */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {sectionPhoto && slot > 0 && (
                    <div className="pdf-block" style={{ width: 130, flexShrink: 0 }}>
                      <div style={{ position: 'relative' }}>
                        <img src={sectionPhoto.url} alt={sectionPhoto.caption} crossOrigin="anonymous" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                        <span style={{ position: 'absolute', top: 4, left: 4, width: 16, height: 16, background: '#c05a17', color: 'white', borderRadius: '50%', fontSize: 8, fontWeight: 'bold', fontFamily: FONT.barlow, textAlign: 'center', lineHeight: '16px', display: 'block', boxSizing: 'border-box' }}>{slot + 1}</span>
                      </div>
                      {sectionPhoto.caption && <p style={{ fontFamily: FONT.lora, fontSize: 8, color: STONE[400], textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{sectionPhoto.caption}</p>}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {paragraphs.map((p, j) => (
                      // Titolo (implicito nell'intestazione colorata sopra) + primo paragrafo
                      // restano nello stesso blocco solo concettualmente qui — il vero
                      // accorpamento "titolo isolato" non si applica (l'intestazione è già un
                      // proprio .pdf-block separato, corto e mai tagliato a metà): ogni
                      // paragrafo ha il proprio blocco, così un racconto lungo scorre su più
                      // pagine senza mai tagliare un paragrafo in due (prima l'intera sezione,
                      // fino a 3000px, era un blocco solo).
                      <p key={j} className="pdf-block" style={{ fontFamily: FONT.lora, fontSize: 11, lineHeight: 1.7, color: STONE[700], margin: '0 0 8px' }}>{p}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Punti di interesse — prima assenti dal PDF */}
        {poiWikiEntries && poiWikiEntries.length > 0 && (
          <div className="pdf-block" style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 16, marginTop: 8, marginBottom: 8 }}>
            <h3 style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: STONE[400], marginBottom: 12 }}>Punti di interesse</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {poiWikiEntries.slice(0, 8).map(({ poi, wiki }, i) => (
                <div key={i} className="pdf-block" style={{ display: 'flex', gap: 8, border: `0.5px solid ${HAIRLINE}`, borderRadius: 6, padding: 8, alignItems: 'center' }}>
                  {wiki.thumbnail
                    ? <img src={wiki.thumbnail} alt="" crossOrigin="anonymous" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    : <div style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0, background: POI_META[poi.type]?.color ?? STONE[300] }} />
                  }
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: FONT.display, fontSize: 11, fontWeight: 700, color: INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wiki.title}</p>
                    <p style={{ fontFamily: FONT.body, fontSize: 8.5, color: STONE[500], margin: '2px 0 0' }}>{POI_META[poi.type]?.label ?? poi.type} · {distLabel(poi.distFromTrack)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="pdf-block" style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 16, marginTop: 8 }}>
            <h3 style={{ fontFamily: FONT.barlow, fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: STONE[400], marginBottom: 12 }}>Documentazione fotografica</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {photos.map((ph, i) => (
                <div key={ph.id} className="pdf-block">
                  <div style={{ position: 'relative' }}>
                    <img src={ph.url} alt={ph.caption} crossOrigin="anonymous" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                    <span style={{ position: 'absolute', top: 4, left: 4, width: 16, height: 16, background: '#c05a17', color: 'white', borderRadius: '50%', fontSize: 7, fontWeight: 'bold', fontFamily: FONT.barlow, textAlign: 'center', lineHeight: '16px', display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i + 1}</span>
                  </div>
                  {ph.caption && <p style={{ fontFamily: FONT.lora, fontSize: 8, color: STONE[400], textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{i + 1}. {ph.caption}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
