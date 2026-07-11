interface Props {
  title: string
  /** Raw text — may contain [curiosita]...[/curiosita] blocks and ### subsections */
  text: string
  photo?: string
  layout?: 'photo-left' | 'photo-right' | 'photo-top' | 'full-width'
  accentColor?: string
  /** Serie altimetrica campionata — mostrata come fascia decorativa quando manca una foto
   *  (vedi GuideTemplate.tsx, sezione "Il percorso"). */
  elevationProfile?: number[]
}

// [epoca poi="X" periodo="Y"]...[/epoca] e [indovinello poi="X"]...[/indovinello] (vedi
// app/api/guide/route.ts) sono pensati per essere estratti separatamente on-screen
// (extractEpochPois/extractRiddles) — la guida a schermo li rimuove dal testo prima di
// arrivare qui, ma il PDF riceve il testo grezzo. In assenza di un equivalente "indovinello"/
// "epoca" nel PDF, vengono semplicemente rimossi invece di trapelare come testo con parentesi
// quadre (bug riscontrato nel PDF caricato dall'utente).
function stripUnrenderedTags(raw: string): string {
  return raw
    .replace(/\[epoca[^\]]*\][\s\S]*?\[\/epoca\]/g, '')
    .replace(/\[indovinello[^\]]*\][\s\S]*?\[\/indovinello\]/g, '')
}

function parseTextBlocks(raw: string): { type: 'paragraph' | 'curiosita' | 'avviso' | 'subsection'; text: string }[] {
  const blocks: { type: 'paragraph' | 'curiosita' | 'avviso' | 'subsection'; text: string }[] = []
  // Stessa convenzione [curiosita]/[avviso] di components/guida/MagazineBody.tsx (on-screen) —
  // prima qui veniva riconosciuto solo [curiosita], quindi un [avviso] (stato del percorso,
  // vedi app/api/guide/route.ts) finiva stampato come testo grezzo con le parentesi quadre.
  const blockRe = /\[(curiosita|avviso)\]([\s\S]*?)\[\/\1\]/g
  let last = 0
  let m: RegExpExecArray | null
  const cleaned = stripUnrenderedTags(raw)

  const flushText = (chunk: string) => {
    let buf: string[] = []
    const flush = () => {
      const p = buf.join(' ').trim()
      if (p) { blocks.push({ type: 'paragraph', text: p }); buf = [] }
    }
    for (const line of chunk.split('\n')) {
      const t = line.trim()
      if (t.startsWith('### ')) { flush(); blocks.push({ type: 'subsection', text: t.slice(4).trim() }) }
      else if (!t) flush()
      else buf.push(t)
    }
    flush()
  }

  while ((m = blockRe.exec(cleaned)) !== null) {
    flushText(cleaned.slice(last, m.index))
    blocks.push({ type: m[1] as 'curiosita' | 'avviso', text: m[2].trim().replace(/\n/g, ' ') })
    last = m.index + m[0].length
  }
  flushText(cleaned.slice(last))
  return blocks
}

/** Traccia SVG dell'andamento altimetrico, in tono terra, per la fascia decorativa
 *  ".guide-terrainband" — sostituisce lo spazio foto quando una sezione (tipicamente "Il
 *  percorso") non ne ha una disponibile. */
function buildTerrainPath(profile: number[], width = 680, height = 100): { line: string; area: string } {
  const min = Math.min(...profile)
  const max = Math.max(...profile)
  const range = max - min || 1
  const pts = profile.map((v, i) => {
    const x = (i / (profile.length - 1 || 1)) * width
    const y = height - ((v - min) / range) * (height - 12) - 6
    return [x, y]
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return { line, area }
}

export default function GuideSection({
  title,
  text,
  photo,
  layout = 'full-width',
  accentColor = '#c05a17',
  elevationProfile,
}: Props) {
  const hasTerrainBand = !photo && (elevationProfile?.length ?? 0) > 1
  const effectiveLayout = photo ? layout : (hasTerrainBand ? 'photo-top' : 'full-width')
  const blocks = parseTextBlocks(text)

  let paraIndex = 0
  const bodyContent = (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'curiosita') {
          return (
            <div key={i} className="guide-curiosita-inline pdf-block">
              <div className="guide-curiosita-inline-accent" style={{ background: accentColor }} />
              <div className="guide-curiosita-inline-inner">
                <p className="guide-curiosita-inline-label" style={{ color: accentColor }}>
                  ◆ LO SAPEVI?
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
                <p className="guide-avviso-inline-label">⚠ STATO DEL PERCORSO</p>
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
        const isLead = paraIndex++ === 0
        return (
          <p
            key={i}
            className={`pdf-block${isLead ? ' guide-section-lead' : ''}`}
            style={isLead ? { borderLeftColor: accentColor } : undefined}
          >
            {b.text}
          </p>
        )
      })}
    </>
  )

  const terrainBand = hasTerrainBand && elevationProfile ? (() => {
    const { line, area } = buildTerrainPath(elevationProfile)
    return (
      <div className="guide-terrainband pdf-block">
        <svg viewBox="0 0 680 100" preserveAspectRatio="none" className="guide-terrainband-svg">
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
          eyebrow colorata + titolo in serif + riga d'accento sottile — non più una fascia
          piena a tutto colore. */}
      <div className="guide-section-header pdf-block">
        <p className="guide-section-kicker" style={{ color: accentColor }}>{title}</p>
        <h2 className="guide-section-title">{title}</h2>
        <div className="guide-section-accent-line" style={{ background: accentColor }} />
      </div>

      {effectiveLayout === 'full-width' && (
        <div className="guide-section-body-full">{bodyContent}</div>
      )}

      {effectiveLayout === 'photo-left' && (
        <div className="guide-section-body-2col">
          <div className="guide-section-photo-col pdf-block">
            <img src={photo} alt={title} className="guide-section-photo" crossOrigin="anonymous" />
            <span className="guide-section-photo-credit">© Wikimedia Commons</span>
          </div>
          <div className="guide-section-text-col">{bodyContent}</div>
        </div>
      )}

      {effectiveLayout === 'photo-right' && (
        <div className="guide-section-body-2col">
          <div className="guide-section-text-col">{bodyContent}</div>
          <div className="guide-section-photo-col pdf-block">
            <img src={photo} alt={title} className="guide-section-photo" crossOrigin="anonymous" />
            <span className="guide-section-photo-credit">© Wikimedia Commons</span>
          </div>
        </div>
      )}

      {effectiveLayout === 'photo-top' && (
        <div>
          {photo
            ? <img src={photo} alt={title} className="guide-section-photo-top" crossOrigin="anonymous" />
            : terrainBand}
          <div className="guide-section-text-3col">{bodyContent}</div>
        </div>
      )}
    </div>
  )
}
