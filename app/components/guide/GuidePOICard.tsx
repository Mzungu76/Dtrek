import GuideKnowBox from './GuideKnowBox'

export interface POICardData {
  name: string
  type: string
  typeColor: string
  /** lib/overpass.ts POI_META[type].emoji — usato dalla griglia finale (GuidePOIIndex), che non
   *  ha altrimenti modo di risalire al tipo grezzo del POI da `type` (già localizzato in etichetta
   *  leggibile, es. "Cima", non la chiave "peak"). */
  emoji?: string
  distanceFromTrail: string
  photo?: string
  description: string
  curiosityTitle?: string
  curiosityText?: string
}

/** Card verticale per la griglia a 2 colonne (GuideTemplate.tsx) — foto in alto con badge
 *  sovrapposto in un angolo (non più affiancato in flusso, dove uno spazio foto più basso del
 *  previsto lo faceva apparire tagliato/sovrapposto), testo sotto. Il POI di punta ha il suo
 *  trattamento dedicato più grande, vedi GuidePOISpotlight.tsx. */
export default function GuidePOICard({ poi }: { poi: POICardData }) {
  return (
    <div className="guide-poi-card pdf-block">
      <div className="guide-poi-card-photo">
        {poi.photo
          ? <img src={poi.photo} alt={poi.name} crossOrigin="anonymous" />
          : <div className="guide-poi-card-photo-placeholder" style={{ background: `linear-gradient(135deg, ${poi.typeColor}, #5e564c)` }} />
        }
        <span className="guide-poi-card-badge" style={{ background: poi.typeColor }}>{poi.type.toUpperCase()}</span>
      </div>
      <div className="guide-poi-card-body">
        <h3 className="guide-poi-card-name">{poi.name}</h3>
        {poi.description && <p className="guide-poi-card-desc">{poi.description}</p>}
        <span className="guide-poi-card-distance">{poi.distanceFromTrail} dal percorso</span>
      </div>
      {poi.curiosityTitle && poi.curiosityText && (
        <div className="guide-poi-card-knowbox">
          <GuideKnowBox title={poi.curiosityTitle} text={poi.curiosityText} color={poi.typeColor} />
        </div>
      )}
    </div>
  )
}
