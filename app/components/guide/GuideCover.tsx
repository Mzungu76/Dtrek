import type { GuideData } from './GuideTemplate'

/** Sfondo copertina sempre la mappa del percorso (mai una foto Wikimedia a caso) — stessa scelta
 *  già fatta per l'hero on-screen (components/guida/GuideHero.tsx): sempre "il tuo percorso",
 *  indipendentemente dalla disponibilità di una foto decente nei dintorni. `data.mapImage` arriva
 *  già ritagliata esattamente alle dimensioni della copertina (fit: 'cover', vedi usePDFExport.ts)
 *  — nessun object-fit lasciato al momento della cattura, che è quello che produceva la mappa
 *  "stirata" verticalmente. */
export default function GuideCover({ data }: { data: GuideData }) {
  return (
    <div className="guide-cover">
      <div className="guide-cover-bg">
        <img src={data.mapImage} alt={data.title} className="guide-cover-bg-img" crossOrigin="anonymous" />
        <div className="guide-cover-gradient" />
      </div>

      <div className="guide-cover-logo">DTREK</div>

      <div className="guide-cover-content">
        <span className="guide-cover-badge">{data.categoryTag}</span>
        <h1 className="guide-cover-title">{data.title.toUpperCase()}</h1>
        {data.date && <p className="guide-cover-date">{data.date}</p>}
      </div>

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
