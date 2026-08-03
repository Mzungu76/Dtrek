'use client'
import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { type SafetyScore } from '@/lib/safetyScore'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { isScoreFresh } from '@/lib/scoreFreshness'

// Shows the cached value immediately if there is one (even a stale one, to avoid a flash of
// "no data"), then refreshes in the background if it's missing or older than SCORE_STALE_DAYS —
// normally that background refresh already happened at import time (app/upload/page.tsx), so
// this is the "reopen it later" half of the same policy.
export function useSafetyScore(
  hike: PlannedHike | null,
  setHike: Dispatch<SetStateAction<PlannedHike | null>>,
): { safetyScore: SafetyScore | null; setSafetyScore: Dispatch<SetStateAction<SafetyScore | null>> } {
  const [safetyScore, setSafetyScore] = useState<SafetyScore | null>(null)

  useEffect(() => {
    if (!hike) return
    if (hike.cachedSafetyScore) setSafetyScore(hike.cachedSafetyScore)
    if (hike.cachedSafetyScore && isScoreFresh(hike.cachedSafetyComputedAt)) return
    let cancelled = false
    computeSafetyForHike(hike).then(safety => {
      if (cancelled) return
      setSafetyScore(safety)
      setHike(prev => prev ? { ...prev, cachedSafetyScore: safety, cachedSafetyComputedAt: new Date().toISOString() } : prev)
    }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id])

  // Il setter è esposto perché la Sicurezza non dipende solo dal percorso ma anche da scelte che
  // l'utente può cambiare mentre la guida è aperta (la tipologia sola andata / andata e ritorno,
  // vedi lib/routeMode.ts): chi provoca il ricalcolo deve poter riportare qui il nuovo valore,
  // altrimenti resterebbe visibile quello vecchio finché la scheda non viene riaperta.
  return { safetyScore, setSafetyScore }
}
