import { MapPin } from 'lucide-react'
import type { POICardData } from './GuidePOICard'

export default function GuidePOIIndex({ pois }: { pois: POICardData[] }) {
  if (pois.length === 0) return null
  return (
    <div>
      <div className="guide-section-header pdf-block">
        <p className="guide-section-kicker" style={{ color: '#813619' }}>TUTTI I LUOGHI NEL PERCORSO</p>
        <h2 className="guide-section-title">Tutti i luoghi nel percorso</h2>
        <p className="guide-section-subtitle">L&apos;indice completo dei punti di interesse trovati lungo il percorso.</p>
        <div className="guide-section-accent-line" style={{ background: '#813619' }} />
      </div>
      <div className="guide-poi-grid">
        {pois.map((poi, i) => (
          <div key={i} className="guide-poi-grid-card pdf-block">
            <span className="guide-poi-grid-icon">
              {poi.emoji ?? <MapPin size={16} color="#73695c" strokeWidth={2} />}
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
