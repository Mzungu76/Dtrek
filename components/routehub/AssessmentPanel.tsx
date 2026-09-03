import type { HikeAssessment } from '@/lib/plannedStore'
import { textPrimary, textMuted } from '@/components/routehub/overlayTheme'
import Kicker from '@/components/ui/Kicker'
import { TornFrame, tornVariant } from '@/components/TornFrame'
import { TACCUINO_PAPER } from '@/lib/taccuinoTokens'

const DIFFICULTY_LABEL: Record<string, string> = {
  facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
}
// Un solo pallino colorato al posto della pillola a tre colori (sfondo+testo+bordo) di prima — la
// difficoltà resta riconoscibile a colpo d'occhio ma non tinge più l'intero controllo.
const DIFFICULTY_DOT: Record<string, string> = {
  facile: 'bg-emerald-500', moderata: 'bg-amber-500', impegnativa: 'bg-orange-500', estrema: 'bg-red-500',
}
const SUIT_LABEL = (s: number) =>
  s >= 75 ? 'Ben preparato' : s >= 50 ? 'Fattibile con impegno' :
  s >= 30 ? 'Al limite delle capacità' : 'Molto sfidante'
const SUIT_COLOR = (s: number) =>
  s >= 75 ? 'bg-emerald-400' : s >= 50 ? 'bg-amber-400' : s >= 30 ? 'bg-orange-400' : 'bg-red-400'

const RISK_DOT: Record<'danger' | 'warning' | 'info', string> = {
  danger: 'bg-red-600', warning: 'bg-amber-600', info: 'bg-sky-700',
}

function RiskRow({ type, text }: { type: 'danger' | 'warning' | 'info'; text: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2 text-sm text-stone-700 border-t border-stone-200 first:border-t-0 first:pt-0">
      <span className={`w-1.5 h-1.5 rounded-full mt-[7px] shrink-0 ${RISK_DOT[type]}`} />
      <span>{text}</span>
    </div>
  )
}

/** Stesso trattamento della card vicina "Punteggio complessivo" (ScoresWidget.tsx, stessa tab
 *  switcher "Dati e sicurezza"): un'unica tessera stone-50, non più un banner a bordo colorato +
 *  una pillola a tre colori + un riquadro completamente tinto per ogni rischio — il colore resta
 *  solo dove serve davvero a distinguere (un pallino), non a tingere ogni elemento. */
export function AssessmentPanel({ a }: { a: HikeAssessment }) {
  const suit = a.suitabilityScore
  return (
    <div className="space-y-3">
      <Kicker>La tua valutazione</Kicker>
      <TornFrame size="card" variant={tornVariant('valutazione')}>
      <div className="px-5 py-5 space-y-4" style={{ background: TACCUINO_PAPER.card }}>
        {a.summary && (
          <p className={`text-sm font-medium leading-relaxed ${textPrimary}`}>{a.summary}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold shrink-0 ${textPrimary}`}>
            <span className={`w-2 h-2 rounded-full ${DIFFICULTY_DOT[a.difficulty]}`} />
            {DIFFICULTY_LABEL[a.difficulty]}
          </span>
          <div className="flex-1 min-w-[140px]">
            <div className={`flex justify-between text-xs font-medium mb-1 ${textMuted}`}>
              <span>Adatta a te</span>
              <span>{suit}% · {SUIT_LABEL(suit)}</span>
            </div>
            <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${SUIT_COLOR(suit)}`} style={{ width: `${suit}%` }} />
            </div>
          </div>
        </div>

        {a.userContext.activityCount > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm pt-1 border-t border-stone-200">
            <div>
              <p className={`text-xs mb-0.5 ${textMuted}`}>vs. media distanza</p>
              <p className={`font-semibold ${textPrimary}`}>
                {a.userContext.vsAvgDistPct}%
                <span className={`text-xs font-normal ml-1 ${textMuted}`}>(media {a.userContext.avgDistanceKm.toFixed(1)} km)</span>
              </p>
            </div>
            <div>
              <p className={`text-xs mb-0.5 ${textMuted}`}>vs. media dislivello</p>
              <p className={`font-semibold ${textPrimary}`}>
                {a.userContext.vsAvgElevPct}%
                <span className={`text-xs font-normal ml-1 ${textMuted}`}>(media {a.userContext.avgElevationM} m D+)</span>
              </p>
            </div>
            {a.userContext.maxDistanceKm > 0 && (
              <div>
                <p className={`text-xs mb-0.5 ${textMuted}`}>record distanza</p>
                <p className={`font-semibold ${textPrimary}`}>{a.userContext.maxDistanceKm.toFixed(1)} km</p>
              </div>
            )}
            {a.userContext.maxElevationM > 0 && (
              <div>
                <p className={`text-xs mb-0.5 ${textMuted}`}>record dislivello</p>
                <p className={`font-semibold ${textPrimary}`}>{a.userContext.maxElevationM} m D+</p>
              </div>
            )}
          </div>
        )}

        {a.risks.length > 0 && (
          <div className="pt-1 border-t border-stone-200">
            <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${textMuted}`}>Fattori di rischio</p>
            {a.risks.map((r, i) => <RiskRow key={i} type={r.type} text={r.text} />)}
          </div>
        )}

        {a.suggestions.length > 0 && (
          <div className="pt-1 border-t border-stone-200">
            <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${textMuted}`}>Consigli pratici</p>
            {a.suggestions.map((s, i) => <RiskRow key={i} type={s.type} text={s.text} />)}
          </div>
        )}
      </div>
      </TornFrame>
    </div>
  )
}
