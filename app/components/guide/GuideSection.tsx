interface Props {
  title: string
  /** Raw text — may contain [curiosita]...[/curiosita] blocks and ### subsections */
  text: string
  photo?: string
  layout?: 'photo-left' | 'photo-right' | 'photo-top' | 'full-width'
  accentColor?: string
}

function parseTextBlocks(raw: string): { type: 'paragraph' | 'curiosita' | 'subsection'; text: string }[] {
  const blocks: { type: 'paragraph' | 'curiosita' | 'subsection'; text: string }[] = []
  const cRe = /\[curiosita\]([\s\S]*?)\[\/curiosita\]/g
  let last = 0
  let m: RegExpExecArray | null

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

  while ((m = cRe.exec(raw)) !== null) {
    flushText(raw.slice(last, m.index))
    blocks.push({ type: 'curiosita', text: m[1].trim().replace(/\n/g, ' ') })
    last = m.index + m[0].length
  }
  flushText(raw.slice(last))
  return blocks
}

export default function GuideSection({
  title,
  text,
  photo,
  layout = 'full-width',
  accentColor = '#d97706',
}: Props) {
  const effectiveLayout = photo ? layout : 'full-width'
  const blocks = parseTextBlocks(text)

  let paraIndex = 0
  const bodyContent = (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'curiosita') {
          return (
            <div key={i} className="guide-curiosita-inline">
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
        if (b.type === 'subsection') {
          return (
            <h3
              key={i}
              style={{ color: accentColor }}
            >
              {b.text}
            </h3>
          )
        }
        const isLead = paraIndex++ === 0
        return (
          <p key={i} className={isLead ? 'guide-section-lead' : ''}>
            {b.text}
          </p>
        )
      })}
    </>
  )

  return (
    <div className="guide-section">
      {/* Full-bleed section header band */}
      <div className="guide-section-header" style={{ background: accentColor }}>
        <span className="guide-section-dot" />
        <h2 className="guide-section-title">{title}</h2>
      </div>

      {effectiveLayout === 'full-width' && (
        <div className="guide-section-body-full">{bodyContent}</div>
      )}

      {effectiveLayout === 'photo-left' && (
        <div className="guide-section-body-2col">
          <div className="guide-section-photo-col">
            <img src={photo} alt={title} className="guide-section-photo" crossOrigin="anonymous" />
            <span className="guide-section-photo-credit">© Wikimedia Commons</span>
          </div>
          <div className="guide-section-text-col">{bodyContent}</div>
        </div>
      )}

      {effectiveLayout === 'photo-right' && (
        <div className="guide-section-body-2col">
          <div className="guide-section-text-col">{bodyContent}</div>
          <div className="guide-section-photo-col">
            <img src={photo} alt={title} className="guide-section-photo" crossOrigin="anonymous" />
            <span className="guide-section-photo-credit">© Wikimedia Commons</span>
          </div>
        </div>
      )}

      {effectiveLayout === 'photo-top' && (
        <div>
          <img src={photo} alt={title} className="guide-section-photo-top" crossOrigin="anonymous" />
          <div className="guide-section-text-3col">{bodyContent}</div>
        </div>
      )}
    </div>
  )
}
