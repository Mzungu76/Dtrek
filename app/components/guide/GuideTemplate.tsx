import GuideCover from './GuideCover'
import GuideSection from './GuideSection'
import GuidePOICard, { type POICardData } from './GuidePOICard'
import GuidePOIIndex from './GuidePOIIndex'
import './guide-print.css'

export interface GuideData {
  title: string
  date?: string
  author?: string
  categoryTag: string
  coverPhoto?: string
  mapImage: string
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
    iLuoghi?:       { text: string; photo?: string }
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

function PageHeader({ title, page }: { title: string; page: number }) {
  return (
    <div className="guide-page-header">
      <span className="guide-page-header-brand">DTREK</span>
      <span className="guide-page-header-title">{title}</span>
      <span className="guide-page-header-num">{page}</span>
    </div>
  )
}

function PageFooter({ title }: { title: string }) {
  return (
    <div className="guide-page-footer">
      <span>Guida escursionistica · {title}</span>
      <span>dtrek.app</span>
    </div>
  )
}

export default function GuideTemplate({ data, forPrint = false }: Props) {
  const { sections, pois } = data
  const wikiPois = pois.filter(p => p.description)
  const allPois  = pois

  return (
    <div
      className="guide-root"
      data-for-print={forPrint}
      style={{ width: forPrint ? '794px' : '100%' }}
    >
      {/* PAGE 1 — Cover */}
      <div className="guide-page" style={{ padding: 0 }}>
        <GuideCover data={data} />
      </div>

      {/* PAGE 2 — Prima di partire + Il percorso */}
      <div className="guide-page">
        <PageHeader title={data.title} page={2} />
        <GuideSection
          title="PRIMA DI PARTIRE"
          text={sections.primadiPartire.text}
          photo={sections.primadiPartire.photo}
          layout="photo-left"
          accentColor="#c05a17"
        />
        <GuideSection
          title="IL PERCORSO"
          text={sections.ilPercorso.text}
          photo={sections.ilPercorso.photo}
          layout="photo-right"
          accentColor="#277134"
        />
        <PageFooter title={data.title} />
      </div>

      {/* PAGE 3 — I luoghi da non perdere (POI cards) */}
      {(wikiPois.length > 0 || sections.iLuoghi) && (
        <div className="guide-page">
          <PageHeader title={data.title} page={3} />
          {sections.iLuoghi && (
            <GuideSection
              title="I LUOGHI DA NON PERDERE"
              text={sections.iLuoghi.text}
              layout="full-width"
              accentColor="#813619"
            />
          )}
          {wikiPois.slice(0, 3).map((poi, i) => (
            <GuidePOICard key={i} poi={poi} />
          ))}
          <PageFooter title={data.title} />
        </div>
      )}

      {/* PAGE 4 — La natura + Sapori */}
      {(sections.laNatura || sections.sapori) && (
        <div className="guide-page">
          <PageHeader title={data.title} page={4} />
          {sections.laNatura && (
            <GuideSection
              title="LA NATURA INTORNO A TE"
              text={sections.laNatura.text}
              photo={sections.laNatura.photo}
              layout="photo-right"
              accentColor="#378d44"
            />
          )}
          {sections.sapori && (
            <GuideSection
              title="SAPORI E TRADIZIONI"
              text={sections.sapori.text}
              photo={sections.sapori.photo}
              layout="photo-left"
              accentColor="#d97220"
            />
          )}
          <PageFooter title={data.title} />
        </div>
      )}

      {/* PAGE 5 — Consigli finali */}
      <div className="guide-page">
        <PageHeader title={data.title} page={5} />
        <GuideSection
          title="CONSIGLI FINALI"
          text={sections.consigliFinali.text}
          layout="full-width"
          accentColor="#5e564c"
        />
        <PageFooter title={data.title} />
      </div>

      {/* FINAL PAGE — All POIs grid */}
      {allPois.length > 0 && (
        <div className="guide-page">
          <PageHeader title={data.title} page={6} />
          <GuidePOIIndex pois={allPois} />
          <PageFooter title={data.title} />
        </div>
      )}
    </div>
  )
}
