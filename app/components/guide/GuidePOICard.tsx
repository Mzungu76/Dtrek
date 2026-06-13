import GuideKnowBox from './GuideKnowBox'

export interface POICardData {
  name: string
  type: string
  typeColor: string
  distanceFromTrail: string
  photo?: string
  description: string
  curiosityTitle?: string
  curiosityText?: string
}

export default function GuidePOICard({ poi }: { poi: POICardData }) {
  return (
    <div className="guide-poi-card">
      {/* Left column: photo + badge */}
      <div className="guide-poi-card-left">
        {poi.photo ? (
          <img
            src={poi.photo}
            alt={poi.name}
            className="guide-poi-card-photo"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="guide-poi-card-photo-placeholder">
            <span>📍</span>
          </div>
        )}
        <span
          className="guide-poi-card-badge"
          style={{ background: poi.typeColor }}
        >
          {poi.type.toUpperCase()}
        </span>
        <span className="guide-poi-card-distance">
          {poi.distanceFromTrail} dal percorso
        </span>
      </div>

      {/* Right column: text */}
      <div className="guide-poi-card-right">
        <div
          className="guide-poi-card-name-bar"
          style={{ borderLeftColor: poi.typeColor }}
        >
          <h3 className="guide-poi-card-name">{poi.name}</h3>
        </div>
        <p className="guide-poi-card-desc">{poi.description}</p>
        {poi.curiosityTitle && poi.curiosityText && (
          <GuideKnowBox title={poi.curiosityTitle} text={poi.curiosityText} />
        )}
      </div>
    </div>
  )
}
