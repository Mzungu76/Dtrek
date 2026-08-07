import type { GuideNotice } from '@/lib/guideNotices'
import { parseNoticeSource } from '@/lib/guideNotices'
import { buildElevationSvgPath } from '@/lib/elevationSvgPath'
import { parseMarkupBlocks } from '@/lib/guideMarkup'

export interface GuideSectionPhoto { url: string; credit: string }

interface Props {
  title: string
  /** Riga statica sotto il titolo — vedi lib/guideSections.ts, GuideSectionDef.subtitle. */
  subtitle?: string
  /** Raw text — may contain [curiosita]...[/curiosita] blocks and ### subsections */
  text: string
  photo?: GuideSectionPhoto
  layout?: 'photo-left' | 'photo-right' | 'photo-top' | 'full-width'
  accentColor?: string
  /** Serie altimetrica campionata — mostrata come fascia decorativa quando manca una foto
   *  (vedi GuideTemplate.tsx, sezione "Il percorso"). */
  elevationProfile?: number[]
  /** Solo per "Verificato online": avvisi con gravità + fonti consultate — vedi lib/guideNotices.ts.
   *  Assenti dal PDF prima di questa sezione (B14): erano mostrati solo a schermo. */
  notices?: GuideNotice[]
  sources?: { title: string }[]
}

// [epoca poi="X" periodo="Y"]...[/epoca] (vedi app/api/guide/route.ts) è pensato per essere
// estratto separatamente on-screen (extractEpochPois) — la guida a schermo lo rimuove dal testo
// prima di arrivare qui, ma il PDF riceve il testo grezzo. In assenza di un equivalente "epoca"
// nel PDF, viene semplicemente rimosso invece di trapelare come testo con parentesi quadre (bug
// riscontrato nel PDF caricato dall'utente).
function stripUnrenderedTags(raw: string): string {
  return raw.replace(/\[epoca[^\]]*\][\s\S]*?\[\/epoca\]/g, '')
}

export default function GuideSection({
  title,
  subtitle,
  text,
  photo,
  layout = 'full-width',
  accentColor = '#c05a17',
  elevationProfile,
  notices,
  sources,
}: Props) {
  const hasTerrainBand = !photo && (elevationProfile?.length ?? 0) > 1
  const effectiveLayout = photo ? layout : (hasTerrainBand ? 'photo-top' : 'full-width')
  const blocks = parseMarkupBlocks(stripUnrenderedTags(text))

  const noticesBlock = notices && notices.length > 0 ? (
    <div className="pdf-block">
      {notices.map((n, i) => {
        const { text: noticeText, url } = parseNoticeSource(n.text)
        return (
          <div key={i} className={`guide-notice guide-notice-${n.severity}`}>
            <span className="guide-notice-dot" />
            <div>
              <p className="guide-notice-text">{noticeText}</p>
              {url && <p className="guide-notice-source">{url}</p>}
            </div>
          </div>
        )
      })}
    </div>
  ) : null

  const sourcesBlock = sources && sources.length > 0 ? (
    <div className="guide-sources-row pdf-block">
      {sources.map((s, i) => <span key={i} className="guide-source-chip">{s.title}</span>)}
    </div>
  ) : null

  const bodyContent = (
    <>
      {noticesBlock}
      {sourcesBlock}
      {blocks.map((b, i) => {
        if (b.type === 'curiosita') {
          return (
            <div key={i} className="guide-curiosita-inline pdf-block">
              <div className="guide-curiosita-inline-accent" style={{ background: accentColor }} />
              <div className="guide-curiosita-inline-inner">
                <p className="guide-curiosita-inline-label" style={{ color: accentColor, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="guide-icon-diamond" style={{ background: accentColor }} /> LO SAPEVI?
                </p>
                <p className="guide-curiosita-inline-text">{b.text}</p>
              </div>
            </div>
          )
        }
        if (b.type === 'avviso') {
          return (
            <div key={i} className="guide-avviso-inline pdf-block">
              <div className="guide-avviso-inline-accent" />
              <div className="guide-avviso-inline-inner">
                <p className="guide-avviso-inline-label">STATO DEL PERCORSO</p>
                <p className="guide-avviso-inline-text">{b.text}</p>
              </div>
            </div>
          )
        }
        if (b.type === 'subsection') {
          return (
            <h3
              key={i}
              className="pdf-block"
              style={{ color: accentColor }}
            >
              {b.text}
            </h3>
          )
        }
        return (
          <p
            key={i}
            className={`pdf-block${b.isFirstText ? ' guide-section-lead' : ''}`}
            style={b.isFirstText ? { borderLeftColor: accentColor } : undefined}
          >
            {b.text}
          </p>
        )
      })}
    </>
  )

  const terrainBand = hasTerrainBand && elevationProfile ? (() => {
    const { line, area } = buildElevationSvgPath(elevationProfile)
    return (
      <div className="guide-terrainband pdf-block">
        {/* preserveAspectRatio era "none": il riquadro reso (larghezza piena colonna, altezza
            fissa CSS) non ha lo stesso rapporto del viewBox 680×100, quindi il profilo veniva
            stirato verticalmente e lo spessore del tratto non risultava uniforme. Il default
            (xMidYMid meet) scala in proporzione, al più con un piccolo margine ai lati. */}
        <svg viewBox="0 0 680 100" className="guide-terrainband-svg">
          <path d={area} fill={`${accentColor}1a`} />
          <path d={line} fill="none" stroke={accentColor} strokeWidth={2} />
        </svg>
        <span className="guide-terrainband-caption">Profilo altimetrico del tratto</span>
      </div>
    )
  })() : null

  return (
    <div className="guide-section">
      {/* Stesso stile editoriale della guida on-screen (components/guida/SectionCard.tsx):
          eyebrow colorata + titolo in serif + riga esplicativa + riga d'accento sottile. */}
      <div className="guide-section-header pdf-block">
        <p className="guide-section-kicker" style={{ color: accentColor }}>{title}</p>
        <h2 className="guide-section-title">{title}</h2>
        {subtitle && <p className="guide-section-subtitle">{subtitle}</p>}
        <div className="guide-section-accent-line" style={{ background: accentColor }} />
      </div>

      {effectiveLayout === 'full-width' && (
        <div className="guide-section-body-full">{bodyContent}</div>
      )}

      {effectiveLayout === 'photo-left' && photo && (
        <div className="guide-section-body-2col">
          <div className="guide-section-photo-col pdf-block">
            <img src={photo.url} alt={title} className="guide-section-photo" crossOrigin="anonymous" />
            <span className="guide-section-photo-credit">{photo.credit}</span>
          </div>
          <div className="guide-section-text-col">{bodyContent}</div>
        </div>
      )}

      {effectiveLayout === 'photo-right' && photo && (
        <div className="guide-section-body-2col">
          <div className="guide-section-text-col">{bodyContent}</div>
          <div className="guide-section-photo-col pdf-block">
            <img src={photo.url} alt={title} className="guide-section-photo" crossOrigin="anonymous" />
            <span className="guide-section-photo-credit">{photo.credit}</span>
          </div>
        </div>
      )}

      {effectiveLayout === 'photo-top' && (
        <div>
          {terrainBand}
          <div className="guide-section-text-3col">{bodyContent}</div>
        </div>
      )}
    </div>
  )
}
