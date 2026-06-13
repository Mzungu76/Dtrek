interface Props {
  title?: string
  text: string
}

export default function GuideKnowBox({ title, text }: Props) {
  return (
    <div className="guide-knowbox">
      <div className="guide-knowbox-accent" />
      <div className="guide-knowbox-inner">
        <p className="guide-knowbox-header">
          <span className="guide-knowbox-icon">◆</span>
          <span className="guide-knowbox-label">LO SAPEVI?</span>
          {title && (
            <span className="guide-knowbox-title">{title.toUpperCase()}</span>
          )}
        </p>
        <p className="guide-knowbox-text">{text}</p>
      </div>
    </div>
  )
}
