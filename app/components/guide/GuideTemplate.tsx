import GuideCover from './GuideCover'
import GuideOverview from './GuideOverview'
import GuideSection from './GuideSection'
import GuidePOICard, { type POICardData } from './GuidePOICard'
import GuidePOISpotlight from './GuidePOISpotlight'
import GuidePOIIndex from './GuidePOIIndex'
import './guide-print.css'

export interface GuideData {
  title: string
  date?: string
  author?: string
  categoryTag: string
  /** Mappa di copertina, full-bleed — pre-ritagliata (fit: 'cover') alle dimensioni esatte della
   *  copertina, vedi usePDFExport.ts. Mai una foto Wikimedia a caso, stessa scelta dell'hero
   *  on-screen. */
  mapImage: string
  /** Mappa più piccola (fit: 'contain', tutto il percorso visibile) per la pagina "a colpo
   *  d'occhio". */
  miniMapImage?: string
  /** Serie altimetrica campionata — usata come fascia decorativa al posto di una foto mancante
   *  nella sezione "Il percorso" (vedi GuideSection.tsx). */
  elevationProfile: number[]
  difficultyLevel: number
  stats: {
    km: number
    dplus: number
    duration: string
    difficulty: string
    maxEle: number
  }
  sections: {
    primadiPartire: { text: string; photo?: string }
    ilPercorso:     { text: string; photo?: string }
    iLuoghi?:       { text: string }
    laNatura?:      { text: string; photo?: string }
    sapori?:        { text: string; photo?: string }
    consigliFinali: { text: string }
  }
  pois: POICardData[]
}

interface Props {
  data: GuideData
  forPrint?: boolean
}

/**
 * Ogni `.guide-print-page` qui sotto è un blocco di contenuto candidato a diventare una o più
 * pagine PDF — non più un contenitore a altezza fissa 794×1123 con page-break CSS (quella
 * combinazione, con html2pdf.js, è quello che produceva le pagine bianche): l'altezza reale la
 * misura e la pagina lib/pdfPaginate.ts (la stessa che già usa il Diario), che spezza solo ai
 * confini `.pdf-block` sicuri, e inietta testata/piè di pagina da sé — non servono più
 * PageHeader/PageFooter qui.
 */
export default function GuideTemplate({ data, forPrint = false }: Props) {
  const { sections, pois } = data
  const wikiPois  = pois.filter(p => p.description)
  const spotlight = wikiPois.find(p => p.photo)
  const gallery   = pois.filter(p => p !== spotlight)

  return (
    <div
      className="guide-root"
      data-for-print={forPrint}
      style={{ width: forPrint ? '794px' : '100%' }}
    >
      <div className="guide-print-page" style={{ padding: 0 }}>
        <GuideCover data={data} />
      </div>

      <div className="guide-print-page">
        <GuideOverview data={data} />
      </div>

      <div className="guide-print-page">
        <GuideSection
          title="PRIMA DI PARTIRE"
          text={sections.primadiPartire.text}
          photo={sections.primadiPartire.photo}
          layout="photo-left"
          accentColor="#c05a17"
        />
      </div>

      <div className="guide-print-page">
        <GuideSection
          title="IL PERCORSO"
          text={sections.ilPercorso.text}
          photo={sections.ilPercorso.photo}
          layout="photo-right"
          accentColor="#277134"
          elevationProfile={data.elevationProfile}
        />
      </div>

      {sections.iLuoghi && (
        <div className="guide-print-page">
          <GuideSection
            title="I LUOGHI DA NON PERDERE"
            text={sections.iLuoghi.text}
            layout="full-width"
            accentColor="#813619"
          />
        </div>
      )}

      {spotlight && (
        <div className="guide-print-page" style={{ padding: 0 }}>
          <GuidePOISpotlight poi={spotlight} />
        </div>
      )}

      {gallery.length > 0 && (
        <div className="guide-print-page">
          <p className="guide-continuation-label" style={{ color: '#813619' }}>I luoghi da non perdere — continua</p>
          <div className="guide-poi-grid2">
            {gallery.slice(0, 6).map((poi, i) => <GuidePOICard key={i} poi={poi} />)}
          </div>
        </div>
      )}

      {sections.laNatura && (
        <div className="guide-print-page">
          <GuideSection
            title="LA NATURA INTORNO A TE"
            text={sections.laNatura.text}
            photo={sections.laNatura.photo}
            layout="photo-right"
            accentColor="#378d44"
          />
        </div>
      )}

      {sections.sapori && (
        <div className="guide-print-page">
          <GuideSection
            title="SAPORI E TRADIZIONI"
            text={sections.sapori.text}
            photo={sections.sapori.photo}
            layout="photo-left"
            accentColor="#d97220"
          />
        </div>
      )}

      <div className="guide-print-page">
        <GuideSection
          title="CONSIGLI FINALI"
          text={sections.consigliFinali.text}
          layout="full-width"
          accentColor="#5e564c"
        />
      </div>

      {pois.length > 0 && (
        <div className="guide-print-page">
          <GuidePOIIndex pois={pois} />
        </div>
      )}
    </div>
  )
}
