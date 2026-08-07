interface Props {
  title?: string
  text: string
  /** Stessa logica del resto del template: colore del POI/sezione, non un ambra fisso —
   *  vedi POI_META in lib/overpass.ts. */
  color?: string
}

export default function GuideKnowBox({ title, text, color = '#c05a17' }: Props) {
  return (
    <div className="guide-knowbox">
      <div className="guide-knowbox-accent" style={{ background: color }} />
      <div className="guide-knowbox-inner">
        <p className="guide-knowbox-header">
          {/* Era il carattere ◆: reso in modo non deterministico da html2canvas (dipende dal font
              di sistema della macchina che genera il PDF). Una forma CSS non ha questo problema. */}
          <span className="guide-icon-diamond" style={{ background: color }} />
          <span className="guide-knowbox-label" style={{ color }}>LO SAPEVI?</span>
          {title && (
            <span className="guide-knowbox-title">{title.toUpperCase()}</span>
          )}
        </p>
        <p className="guide-knowbox-text">{text}</p>
      </div>
    </div>
  )
}
