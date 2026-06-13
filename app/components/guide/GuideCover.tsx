import type { GuideData } from './GuideTemplate'

export default function GuideCover({ data }: { data: GuideData }) {
  return (
    <div className="guide-cover">
      {/* Background: hero or map */}
      <div className="guide-cover-bg">
        <img
          src={data.coverPhoto ?? data.mapImage}
          alt={data.title}
          className="guide-cover-bg-img"
          crossOrigin="anonymous"
          style={{ objectPosition: 'center 30%' }}
        />
        <div className="guide-cover-gradient" />
      </div>

      {/* DTrek logo */}
      <div className="guide-cover-logo">DTREK</div>

      {/* Minimap (top-right) — only when coverPhoto differs from mapImage */}
      {data.coverPhoto && data.mapImage && (
        <div className="guide-cover-minimap">
          <img src={data.mapImage} alt="mappa percorso" crossOrigin="anonymous" />
        </div>
      )}

      {/* Title block */}
      <div className="guide-cover-content">
        <span className="guide-cover-badge">{data.categoryTag}</span>
        <h1 className="guide-cover-title">{data.title.toUpperCase()}</h1>
        {data.date && <p className="guide-cover-date">{data.date}</p>}
      </div>

      {/* Stats strip */}
      <div className="guide-cover-stats">
        {[
          { value: `${data.stats.km} km`,   label: 'Distanza' },
          { value: `+${data.stats.dplus} m`, label: 'Dislivello' },
          { value: data.stats.duration,      label: 'Durata' },
          { value: `${data.stats.maxEle} m`, label: 'Quota max' },
        ].map((s, i) => (
          <div key={i} className="guide-cover-stat">
            <span className="guide-cover-stat-value">{s.value}</span>
            <span className="guide-cover-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
