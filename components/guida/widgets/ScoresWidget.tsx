'use client'
import { Compass, Layers } from 'lucide-react'
import { ScoreRing, computeTrailScoreBreakdown, isTrailScoreVetoed, type CtsProps } from '@/components/ScoreRing'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import type { SafetyScore } from '@/lib/safetyScore'
import type { GuideNotice } from '@/lib/guideNotices'
import { glassTile, textMuted } from '@/components/routehub/overlayTheme'
import Kicker from '@/components/ui/Kicker'

interface Props {
  safety: SafetyScore | null
  cts: CtsProps
  showAspectToggle: boolean
  showGradientToggle: boolean
  showAspect: boolean
  showGradient: boolean
  onToggleAspect: () => void
  onToggleGradient: () => void
  /** Avvisi trovati da Giulia (vedi lib/guideNotices.ts) — puntini sull'anello Sicurezza del badge,
   *  puramente informativi. */
  guideNotices?: GuideNotice[]
}

/** Punteggi (Sicurezza/Comfort TrailScore) — spostati dalla vecchia tab "Dati & punteggi" nella
 *  sezione "Dati e sicurezza" della guida magazine. Il badge a doppio anello dà il colpo d'occhio,
 *  la lista sotto apre il dettaglio di ciascun punteggio in un foglio a comparsa. */
export default function ScoresWidget({
  safety, cts, guideNotices,
  showAspectToggle, showGradientToggle, showAspect, showGradient, onToggleAspect, onToggleGradient,
}: Props) {
  const breakdown = computeTrailScoreBreakdown(safety, cts)

  return (
    <div className="space-y-3">
      <Kicker>Punteggio complessivo</Kicker>

      <div className="rounded-2xl bg-gradient-to-br from-stone-900 to-stone-800 px-5 py-7 flex items-center justify-center">
        <TrailScoreGaugeBadge
          total={breakdown.total > 0 ? breakdown.total : null}
          value={breakdown.value}
          safety={safety}
          vetoed={isTrailScoreVetoed(safety)}
          notices={guideNotices}
          size={128}
        />
      </div>

      <ScoreRing safety={safety} cts={cts} />

      {(showAspectToggle || showGradientToggle) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {showAspectToggle && (
            <button onClick={onToggleAspect}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showAspect ? 'bg-sky-500 text-white border-sky-500' : `${glassTile} ${textMuted}`}`}>
              <Compass className="w-3 h-3" /> Esposizione
            </button>
          )}
          {showGradientToggle && (
            <button onClick={onToggleGradient}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${showGradient ? 'bg-sky-500 text-white border-sky-500' : `${glassTile} ${textMuted}`}`}>
              <Layers className="w-3 h-3" /> Pendenza
            </button>
          )}
        </div>
      )}
    </div>
  )
}
