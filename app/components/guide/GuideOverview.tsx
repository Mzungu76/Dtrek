import { Compass, Route, MapPin, Leaf, UtensilsCrossed, ShieldCheck, Radar, BarChart2 } from 'lucide-react'
import type { GuideData } from './GuideTemplate'
import GuideAssessment from './GuideAssessment'

const DIFFICULTY_LABEL: Record<string, string> = {
  facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
}

/** Stessa mappa icona/colore per sezione di components/guida/sectionStyle.tsx (on-screen) —
 *  chiavi diverse (qui la forma è quella di GuideData.sections, non GuideSectionKey) quindi
 *  duplicata invece di importata, ma stessi lucide-react e stessi colori terra/forest/stone. */
const TOC_ITEMS: { key: keyof GuideData['sections']; label: string; icon: typeof Compass; color: string }[] = [
  { key: 'primadiPartire', label: 'Prima di partire',        icon: Compass,          color: '#c05a17' },
  { key: 'ilPercorso',     label: 'Il percorso',              icon: Route,            color: '#277134' },
  { key: 'verificato',     label: 'Verificato online',        icon: Radar,            color: '#0f6e94' },
  { key: 'datiSicurezza',  label: 'Dati e sicurezza',         icon: BarChart2,        color: '#73695c' },
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

      {/* Badge difficoltà + adattamento personalizzato + rischi/consigli — prima solo nel PDF
          jsPDF a sé ("Valutazione Personalizzata", ritirato con questa fase), assente qui. La
          sezione narrativa "Dati e sicurezza" (GuideTemplate.tsx) dichiara esplicitamente "i
          punteggi già mostrati sopra": prima di questa riga quella frase non era vera. */}
      {data.assessment && <GuideAssessment assessment={data.assessment} />}

      {/* Stesso criterio di GuideTemplate: una sezione senza testo AI non viene stampata, quindi
          non deve nemmeno comparire nel sommario — su un percorso di cui non è ancora stata
          generata la guida l'indice elencava sezioni inesistenti. */}
      <div className="guide-overview-toc pdf-block">
        {TOC_ITEMS.filter(t => data.sections[t.key]?.text?.trim()).map(t => {
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
              {/* poi.emoji è già l'icona per-tipo di POI_META, disegnata a schermo allo stesso
                  modo: qui resta. Solo il ripiego 📍 è stato sostituito — html2canvas rende gli
                  emoji con il font di sistema, non deterministico tra macchine (vedi GuideSection). */}
              <span className="guide-overview-hlchip-icon" style={{ background: poi.typeColor }}>
                {poi.emoji ?? <MapPin size={11} color="white" strokeWidth={2.5} />}
              </span>
              <span>{poi.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
