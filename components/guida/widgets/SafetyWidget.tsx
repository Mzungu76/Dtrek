'use client'
import { AssessmentPanel } from '@/components/routehub/AssessmentPanel'
import { CurrentConditionsNotice } from '@/components/CurrentConditionsNotice'
import type { HikeAssessment } from '@/lib/hikeAssessment'
import type { ClassifiedDifficultyMarker } from '@/lib/difficultyMarkers'
import type { CLSignals } from '@/lib/cl/types'
import { textMuted } from '@/components/routehub/overlayTheme'
import Kicker from '@/components/ui/Kicker'

interface Props {
  assessment?: HikeAssessment
  hasGps: boolean
  notMatched: boolean
  osmId?: number
  polyline?: [number, number][]
  plannedId: string
  signals?: CLSignals
  markers: ClassifiedDifficultyMarker[]
  highlightedMarkerIndex?: number | null
  markerRef?: (i: number) => (el: HTMLDivElement | null) => void
}

/** Valutazione personalizzata + condizioni attuali + segnalazioni dal tracciato — spostati
 *  dalla vecchia tab "Sicurezza & segnalazioni" nella sezione "Dati e sicurezza" della guida. */
export default function SafetyWidget({
  assessment, hasGps, notMatched, osmId, polyline, plannedId, signals, markers, highlightedMarkerIndex, markerRef,
}: Props) {
  return (
    <div className="space-y-5">
      {assessment && <AssessmentPanel a={assessment} />}
      {hasGps && !notMatched && (
        <div className={assessment ? 'pt-5 border-t border-stone-100' : ''}>
          <CurrentConditionsNotice osmId={osmId} polyline={polyline} plannedId={plannedId} signals={signals} />
        </div>
      )}
      {markers.length > 0 && (
        <div className={`space-y-2 ${assessment || (hasGps && !notMatched) ? 'pt-5 border-t border-stone-100' : ''}`}>
          <Kicker>Segnalazioni dal tracciato</Kicker>
          {markers.map((m, i) => {
            const highlighted = i === highlightedMarkerIndex
            const colors = m.severity === 'danger' ? 'bg-red-50 border-red-200 text-red-700' : m.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-sky-50 border-sky-200 text-sky-700'
            return (
              <div key={i} ref={markerRef?.(i)} className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${colors} ${highlighted ? 'ring-2 ring-offset-1 ring-offset-black/50 ring-current' : ''}`}>
                {m.text}
              </div>
            )
          })}
        </div>
      )}
      {!assessment && markers.length === 0 && (
        <p className={`text-sm italic ${textMuted}`}>Nessuna valutazione disponibile per questo percorso.</p>
      )}
    </div>
  )
}
