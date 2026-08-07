import GuideCover from './GuideCover'
import GuideOverview from './GuideOverview'
import GuideSection, { type GuideSectionPhoto } from './GuideSection'
import GuidePOICard, { type POICardData } from './GuidePOICard'
import GuidePOISpotlight from './GuidePOISpotlight'
import GuidePOIIndex from './GuidePOIIndex'
import type { GuideNotice } from '@/lib/guideNotices'
import type { HikeAssessment } from '@/lib/hikeAssessment'
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
    primadiPartire: { text: string; photo?: GuideSectionPhoto }
    ilPercorso:     { text: string; photo?: GuideSectionPhoto }
    /** Tre sezioni assenti dal PDF prima di questa fase (B14): mappate solo a schermo, mai qui —
     *  "Verificato online" porta con sé avvisi/fonti (vedi notices/sources sotto), le altre due
     *  sono testo semplice come "Consigli finali". */
    verificato?:    { text: string }
    datiSicurezza?: { text: string }
    suMisura?:      { text: string }
    iLuoghi?:       { text: string }
    laNatura?:      { text: string; photo?: GuideSectionPhoto }
    sapori?:        { text: string; photo?: GuideSectionPhoto }
    consigliFinali: { text: string }
  }
  /** Avvisi trovati dalla ricerca web di Giulia (vedi lib/guideNotices.ts) — mostrati nella
   *  sezione "Verificato online", stessi dati della vista a schermo. */
  notices?: GuideNotice[]
  sources?: { title: string }[]
  /** Badge difficoltà + punteggio di adattamento personalizzato + rischi/consigli (lib/
   *  hikeAssessment.ts) — vedi GuideAssessment.tsx sulla pagina "a colpo d'occhio". */
  assessment?: HikeAssessment
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
      {/* pdf-bleed: copertina a pagina piena, senza testatina né numero di pagina. Prima il piede
          veniva disegnato sopra la fascia arancione delle statistiche, grigio su arancione. */}
      <div className="guide-print-page pdf-bleed" style={{ padding: 0 }}>
        <GuideCover data={data} />
      </div>

      <div className="guide-print-page">
        <GuideOverview data={data} />
      </div>

      <div className="guide-print-page">
        <GuideSection
          title="PRIMA DI PARTIRE"
          subtitle="Equipaggiamento, stagione ideale e orario di partenza consigliati per questo percorso."
          text={sections.primadiPartire.text}
          photo={sections.primadiPartire.photo}
          layout="photo-left"
          accentColor="#c05a17"
        />
      </div>

      <div className="guide-print-page">
        <GuideSection
          title="IL PERCORSO"
          subtitle="Il racconto del tracciato: atmosfera, panorami, cosa si prova a camminarci."
          text={sections.ilPercorso.text}
          photo={sections.ilPercorso.photo}
          layout="photo-right"
          accentColor="#277134"
          elevationProfile={data.elevationProfile}
        />
      </div>

      {sections.verificato && (
        <div className="guide-print-page">
          <GuideSection
            title="VERIFICATO ONLINE"
            subtitle="Chiusure, allerte e aggiornamenti trovati online per questo percorso, con le fonti consultate."
            text={sections.verificato.text}
            layout="full-width"
            accentColor="#0f6e94"
            notices={data.notices}
            sources={data.sources}
          />
        </div>
      )}

      {sections.datiSicurezza && (
        <div className="guide-print-page">
          <GuideSection
            title="DATI E SICUREZZA"
            subtitle="Un commento a voce su rischi, difficoltà e punteggi di sicurezza già mostrati sopra."
            text={sections.datiSicurezza.text}
            layout="full-width"
            accentColor="#73695c"
          />
        </div>
      )}

      {sections.suMisura && (
        <div className="guide-print-page">
          <GuideSection
            title="SU MISURA PER TE"
            subtitle="Quanto questo percorso è in linea con le tue capacità e preferenze personali."
            text={sections.suMisura.text}
            layout="full-width"
            accentColor="#9f4315"
          />
        </div>
      )}

      {sections.iLuoghi && (
        <div className="guide-print-page">
          <GuideSection
            title="I LUOGHI DA NON PERDERE"
            subtitle="Storia, leggende e curiosità dei punti di interesse lungo il tracciato."
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
            subtitle="Flora, fauna e geologia che potresti incontrare, in base alla stagione."
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
            subtitle="Gastronomia locale, tradizioni e prodotti tipici della zona."
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
          subtitle="Sicurezza, segnaletica, varianti e contatti utili per l'escursione."
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
