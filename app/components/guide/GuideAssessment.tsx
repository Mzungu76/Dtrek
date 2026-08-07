import type { AssessmentItem, HikeAssessment } from '@/lib/hikeAssessment'

// Prima viveva solo nel documento jsPDF ritirato con questa fase (utils/pdfExport/planned.ts,
// "Valutazione Personalizzata") — un secondo PDF per lo stesso oggetto, in Helvetica e colori
// estranei al brand. Qui lo stesso contenuto (badge di difficoltà, adattamento percentuale,
// rischi/consigli) entra nell'unico documento DOM-based, con gli stessi token di GuideTemplate.

const DIFFICULTY_LABEL: Record<HikeAssessment['difficulty'], string> = {
  facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
}
const DIFFICULTY_COLOR: Record<HikeAssessment['difficulty'], string> = {
  facile: '#378d44', moderata: '#d97220', impegnativa: '#c05a17', estrema: '#dc2626',
}
const ITEM_DOT: Record<AssessmentItem['type'], string> = {
  danger: '#dc2626', warning: '#d97220', info: '#0f6e94',
}

function suitabilityColor(score: number): string {
  if (score >= 75) return '#378d44'
  if (score >= 50) return '#d97220'
  if (score >= 30) return '#c05a17'
  return '#dc2626'
}

export default function GuideAssessment({ assessment }: { assessment: HikeAssessment }) {
  const { difficulty, suitabilityScore, risks, suggestions } = assessment
  return (
    <div className="guide-assessment pdf-block">
      <div className="guide-assessment-top">
        <span className="guide-assessment-badge" style={{ background: DIFFICULTY_COLOR[difficulty] }}>
          {DIFFICULTY_LABEL[difficulty] ?? difficulty}
        </span>
        <div className="guide-assessment-bar-wrap">
          <div className="guide-assessment-bar">
            <div style={{ width: `${Math.max(4, Math.round(suitabilityScore))}%`, background: suitabilityColor(suitabilityScore) }} />
          </div>
          <span className="guide-assessment-bar-label">Adatta a te: {suitabilityScore}%</span>
        </div>
      </div>

      {(risks.length > 0 || suggestions.length > 0) && (
        <div className="guide-assessment-lists">
          {risks.length > 0 && (
            <div className="guide-assessment-col">
              <p className="guide-assessment-col-title">Fattori di rischio</p>
              <ul className="guide-assessment-list">
                {risks.slice(0, 5).map((r, i) => (
                  <li key={i}>
                    <span className="guide-assessment-dot" style={{ background: ITEM_DOT[r.type] }} />
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="guide-assessment-col">
              <p className="guide-assessment-col-title">Consigli pratici</p>
              <ul className="guide-assessment-list">
                {suggestions.slice(0, 5).map((s, i) => (
                  <li key={i}>
                    <span className="guide-assessment-dot" style={{ background: '#378d44' }} />
                    {s.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
