import { Compass, Route, MapPin, Leaf, UtensilsCrossed, ShieldCheck } from 'lucide-react'
import type { GuideData } from './GuideTemplate'

const DIFFICULTY_LABEL: Record<string, string> = {
  facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
}

/** Stessa mappa icona/colore per sezione di components/guida/sectionStyle.tsx (on-screen) —
 *  chiavi diverse (qui la forma è quella di GuideData.sections, non GuideSectionKey) quindi
 *  duplicata invece di importata, ma stessi lucide-react e stessi colori terra/forest/stone. */
const TOC_ITEMS: { key: keyof GuideData['sections']; label: string; icon: typeof Compass; color: string }[] = [
  { key: 'primadiPartire', label: 'Prima di partire',        icon: Compass,          color: '#c05a17' },
  { key: 'ilPercorso',     label: 'Il percorso',              icon: Route,            color: '#277134' },
  { key: 'iLuoghi',        label: 'I luoghi da non perdere',  icon: MapPin,           color: '#813619' },
  { key: 'laNatura',       label: 'La natura intorno a te',   icon: Leaf,             color: '#378d44' },
  { key: 'sapori',         label: 'Sapori e tradizioni',      icon: UtensilsCrossed,  color: '#d97220' },
  { key: 'consigliFinali', label: 'Consigli finali',          icon: ShieldCheck,      color: '#5e564c' },
]

/** Pagina "a colpo d'occhio" — non esisteva prima: mini-mappa, statistiche, indicatore di
 *  difficoltà, sommario delle sezioni presenti e i luoghi più rilevanti, tutto in una sola
 *  schermata, come l'apertura di un vero articolo da rivista invece di un lungo documento. */
export default function GuideOverview({ data }: { data: GuideData }) {
  const highlights = data.pois.filter(p => p.description).slice(0, 3)
  const diffLabel = DIFFICULTY_LABEL[data.stats.difficulty] ?? data.stats.difficulty

  return (
    <div className="guide-overview">
      <p className="guide-overview-kicker pdf-block">La guida in breve</p>
      <h1 className="guide-overview-title pdf-block">Cosa trovi in questa guida</h1>

      {data.miniMapImage && (
        <div className="guide-overview-minimap pdf-block">
          <img src={data.miniMapImage} alt="Mappa del percorso" crossOrigin="anonymous" />
        </div>
      )}

      <div className="guide-overview-statgrid pdf-block">
        <div><b>{data.stats.km}</b><span>km</span></div>
        <div><b>+{data.stats.dplus}</b><span>m D+</span></div>
        <div><b>{data.stats.duration}</b><span>durata</span></div>
        <div><b>{data.stats.maxEle}</b><span>m max</span></div>
      </div>

      {diffLabel && (
        <div className="guide-overview-gauge-row pdf-block">
          <span className="guide-overview-gauge-label">{diffLabel}</span>
          <div className="guide-overview-gauge">
            <div style={{ width: `${Math.round(data.difficultyLevel * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="guide-overview-toc pdf-block">
        {TOC_ITEMS.filter(t => data.sections[t.key]).map(t => {
          const Icon = t.icon
          return (
            <div key={t.key} className="guide-overview-toc-row">
              <span className="guide-overview-toc-icon" style={{ color: t.color }}><Icon size={11} strokeWidth={2.25} /></span>
              <span className="guide-overview-toc-text">{t.label}</span>
            </div>
          )
        })}
      </div>

      {highlights.length > 0 && (
        <div className="guide-overview-highlights pdf-block">
          {highlights.map((poi, i) => (
            <div key={i} className="guide-overview-hlchip">
              <span className="guide-overview-hlchip-icon" style={{ background: poi.typeColor }}>{poi.emoji ?? '📍'}</span>
              <span>{poi.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
