'use client'
import { ScoreRing, computeTrailScoreBreakdown, isTrailScoreVetoed, type CtsProps } from '@/components/ScoreRing'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import type { SafetyScore } from '@/lib/safetyScore'
import type { PersonalSafety } from '@/lib/personalSafetyFit'
import type { GuideNotice } from '@/lib/guideNotices'
import Kicker from '@/components/ui/Kicker'

interface Props {
  safety: SafetyScore | null
  personalSafety?: PersonalSafety | null
  cts: CtsProps
  /** Avvisi trovati da Giulia (vedi lib/guideNotices.ts) — puntini sull'anello Sicurezza del badge,
   *  puramente informativi. */
  guideNotices?: GuideNotice[]
}

/** Punteggi (Sicurezza/Comfort TrailScore) — spostati dalla vecchia tab "Dati & punteggi" nella
 *  sezione "Dati e sicurezza" della guida magazine. Il badge a doppio anello dà il colpo d'occhio;
 *  di default mostra solo il Consiglio (già una sintesi di Sicurezza+Idoneità) — il resto,
 *  ScoreRing incluso, sta dietro "Vedi il dettaglio" invece di restare sempre impilato sotto come
 *  un secondo pannello a parte. Il toggle "Pendenza" (mostra il gradiente sul tracciato) è già
 *  raggiungibile dai controlli della mappa in "Il percorso" (components/RouteMapSection.tsx) —
 *  non serve ripeterlo qui. */
export default function ScoresWidget({ safety, personalSafety, cts, guideNotices }: Props) {
  const breakdown = computeTrailScoreBreakdown(safety, cts)

  return (
    <div className="space-y-3">
      <Kicker>Punteggio complessivo</Kicker>

      <div className="rounded-2xl bg-stone-50 border border-stone-100 px-5 py-6">
        <TrailScoreGaugeBadge
          total={breakdown.total > 0 ? breakdown.total : null}
          value={breakdown.value}
          safety={safety}
          personalSafety={personalSafety}
          disclaimer="inline"
          captionLayout="stacked"
          vetoed={isTrailScoreVetoed(safety)}
          notices={guideNotices}
          size={128}
          detailExtra={<ScoreRing safety={safety} cts={cts} />}
        />
      </div>
    </div>
  )
}
