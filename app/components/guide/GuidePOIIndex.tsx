import type { POICardData } from './GuidePOICard'

const POI_ICONS: Record<string, string> = {
  peak: '⛰️', hut: '🏠', bivouac: '⛺', spring: '💧', viewpoint: '👁️',
  cross: '✝️', pass: '🏔️', waterfall: '💦', cave: '🕳️', shelter: '🏕️',
  ruins: '🏚️', archaeological: '🏛️', castle: '🏰', fountain: '⛲',
  chapel: '⛪', tower: '🗼', monument: '🗿',
}

export default function GuidePOIIndex({ pois }: { pois: POICardData[] }) {
  if (pois.length === 0) return null
  return (
    <div>
      <h2 className="guide-poi-index-title">TUTTI I LUOGHI NEL PERCORSO</h2>
      <div className="guide-poi-grid">
        {pois.map((poi, i) => (
          <div key={i} className="guide-poi-grid-card">
            <span className="guide-poi-grid-icon">
              {POI_ICONS[poi.type] ?? '📍'}
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
