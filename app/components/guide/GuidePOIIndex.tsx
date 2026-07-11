import type { POICardData } from './GuidePOICard'

export default function GuidePOIIndex({ pois }: { pois: POICardData[] }) {
  if (pois.length === 0) return null
  return (
    <div>
      <div className="guide-section-header">
        <p className="guide-section-kicker" style={{ color: '#813619' }}>TUTTI I LUOGHI NEL PERCORSO</p>
        <h2 className="guide-section-title">Tutti i luoghi nel percorso</h2>
        <div className="guide-section-accent-line" style={{ background: '#813619' }} />
      </div>
      <div className="guide-poi-grid">
        {pois.map((poi, i) => (
          <div key={i} className="guide-poi-grid-card">
            <span className="guide-poi-grid-icon">
              {poi.emoji ?? '📍'}
            </span>
            <span className="guide-poi-grid-name">{poi.name}</span>
            <span
              className="guide-poi-grid-badge"
              style={{ background: poi.typeColor }}
            >
              {poi.type.toUpperCase()}
            </span>
            <span className="guide-poi-grid-dist">{poi.distanceFromTrail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
