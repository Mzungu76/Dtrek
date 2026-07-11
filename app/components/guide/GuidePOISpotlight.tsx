import GuideKnowBox from './GuideKnowBox'
import type { POICardData } from './GuidePOICard'

/** Trattamento "da servizio giornalistico" per il luogo più rilevante del percorso — foto grande,
 *  nome in grande, testo più lungo — invece di essere schiacciato in una card da 36% di colonna
 *  come gli altri. Solo il primo POI con una foto reale riceve questo trattamento (vedi
 *  GuideTemplate.tsx); gli altri restano nella galleria compatta. */
export default function GuidePOISpotlight({ poi }: { poi: POICardData }) {
  return (
    <div className="guide-spotlight">
      <div className="guide-spotlight-photo pdf-block">
        {poi.photo
          ? <img src={poi.photo} alt={poi.name} crossOrigin="anonymous" />
          : <div className="guide-spotlight-photo-placeholder" style={{ background: `linear-gradient(135deg, ${poi.typeColor}, #5e564c)` }} />
        }
        <span className="guide-spotlight-badge" style={{ background: poi.typeColor }}>{poi.type.toUpperCase()}</span>
        <span className="guide-spotlight-dist">{poi.distanceFromTrail} dal percorso</span>
      </div>
      <div className="guide-spotlight-body">
        <p className="guide-spotlight-kicker pdf-block">I luoghi da non perdere</p>
        <h2 className="guide-spotlight-name pdf-block">{poi.name}</h2>
        <p className="guide-spotlight-text pdf-block">{poi.description}</p>
        {poi.curiosityTitle && poi.curiosityText && (
          <GuideKnowBox title={poi.curiosityTitle} text={poi.curiosityText} color={poi.typeColor} />
        )}
      </div>
    </div>
  )
}
