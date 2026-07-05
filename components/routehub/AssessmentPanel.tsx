import { ShieldAlert, AlertTriangle, Info } from 'lucide-react'
import type { HikeAssessment } from '@/lib/plannedStore'
import { glassTile, textPrimary, textMuted, sectionHeading } from '@/components/routehub/overlayTheme'

const DIFFICULTY_LABEL: Record<string, string> = {
  facile: 'Facile', moderata: 'Moderata', impegnativa: 'Impegnativa', estrema: 'Estrema',
}
const DIFFICULTY_COLORS: Record<string, string> = {
  facile:      'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  moderata:    'bg-amber-400/15 text-amber-300 border-amber-400/30',
  impegnativa: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
  estrema:     'bg-red-400/15 text-red-300 border-red-400/30',
}
const SUIT_LABEL = (s: number) =>
  s >= 75 ? 'Ben preparato' : s >= 50 ? 'Fattibile con impegno' :
  s >= 30 ? 'Al limite delle capacità' : 'Molto sfidante'
const SUIT_COLOR = (s: number) =>
  s >= 75 ? 'bg-emerald-400' : s >= 50 ? 'bg-amber-400' : s >= 30 ? 'bg-orange-400' : 'bg-red-400'

function RiskItem({ type, text }: { type: 'danger' | 'warning' | 'info'; text: string }) {
  const colors = {
    danger:  'bg-red-400/10 border-red-400/25 text-red-200',
    warning: 'bg-amber-400/10 border-amber-400/25 text-amber-200',
    info:    'bg-sky-400/10 border-sky-400/25 text-sky-200',
  }
  const Icon = type === 'danger' ? ShieldAlert : type === 'warning' ? AlertTriangle : Info
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${colors[type]}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  )
}

export function AssessmentPanel({ a }: { a: HikeAssessment }) {
  const suit = a.suitabilityScore
  const hasDanger  = a.risks.some(r => r.type === 'danger')
  const hasWarning = a.risks.some(r => r.type === 'warning')
  const summaryBorder = hasDanger ? 'border-red-400' : hasWarning ? 'border-amber-400' : 'border-emerald-400'
  return (
    <div className="space-y-5">
      {a.summary && (
        <div className={`border-l-4 ${summaryBorder} bg-white/[0.05] rounded-r-lg px-4 py-3 text-sm font-medium ${textPrimary}`}>
          {a.summary}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-start">
        <div className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${DIFFICULTY_COLORS[a.difficulty]}`}>
          {DIFFICULTY_LABEL[a.difficulty]}
        </div>
        <div className="flex-1 min-w-[180px] space-y-1">
          <div className={`flex justify-between text-xs font-medium ${textMuted}`}>
            <span>Adatta a te</span>
            <span>{suit}% · {SUIT_LABEL(suit)}</span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${SUIT_COLOR(suit)}`} style={{ width: `${suit}%` }} />
          </div>
        </div>
      </div>

      {a.userContext.activityCount > 0 && (
        <div className={`${glassTile} p-4 grid grid-cols-2 gap-3 text-sm`}>
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
        <div>
          <p className={`${sectionHeading} mb-2`}>Fattori di rischio</p>
          <div className="space-y-2">
            {a.risks.map((r, i) => <RiskItem key={i} type={r.type} text={r.text} />)}
          </div>
        </div>
      )}

      {a.suggestions.length > 0 && (
        <div>
          <p className={`${sectionHeading} mb-2`}>Consigli pratici</p>
          <div className="space-y-2">
            {a.suggestions.map((s, i) => <RiskItem key={i} type={s.type} text={s.text} />)}
          </div>
        </div>
      )}
    </div>
  )
}
