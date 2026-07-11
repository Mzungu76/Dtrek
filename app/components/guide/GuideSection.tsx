interface Props {
  title: string
  /** Raw text — may contain [curiosita]...[/curiosita] blocks and ### subsections */
  text: string
  photo?: string
  layout?: 'photo-left' | 'photo-right' | 'photo-top' | 'full-width'
  accentColor?: string
}

function parseTextBlocks(raw: string): { type: 'paragraph' | 'curiosita' | 'avviso' | 'subsection'; text: string }[] {
  const blocks: { type: 'paragraph' | 'curiosita' | 'avviso' | 'subsection'; text: string }[] = []
  // Stessa convenzione [curiosita]/[avviso] di components/guida/MagazineBody.tsx (on-screen) —
  // prima qui veniva riconosciuto solo [curiosita], quindi un [avviso] (stato del percorso,
  // vedi app/api/guide/route.ts) finiva stampato come testo grezzo con le parentesi quadre.
  const blockRe = /\[(curiosita|avviso)\]([\s\S]*?)\[\/\1\]/g
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

  while ((m = blockRe.exec(raw)) !== null) {
    flushText(raw.slice(last, m.index))
    blocks.push({ type: m[1] as 'curiosita' | 'avviso', text: m[2].trim().replace(/\n/g, ' ') })
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
  accentColor = '#c05a17',
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
        if (b.type === 'avviso') {
          return (
            <div key={i} className="guide-avviso-inline">
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
      {/* Stesso stile editoriale della guida on-screen (components/guida/SectionCard.tsx):
          eyebrow colorata + titolo in serif + riga d'accento sottile — non più una fascia
          piena a tutto colore. */}
      <div className="guide-section-header">
        <p className="guide-section-kicker" style={{ color: accentColor }}>{title}</p>
        <h2 className="guide-section-title">{title}</h2>
        <div className="guide-section-accent-line" style={{ background: accentColor }} />
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
