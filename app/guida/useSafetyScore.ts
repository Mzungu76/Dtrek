'use client'
import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { type SafetyScore } from '@/lib/safetyScore'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { isScoreFresh } from '@/lib/scoreFreshness'
import { metaEligibleForHikingScores } from '@/lib/guideCardVariant'

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
    // Confine esplicito di tipologia (piano guide-eccellenza §Fase 4) — prima questo effect non ne
    // aveva nessuno: calcolava una Sicurezza per qualunque Meta, anche un Sito o un Borgo/Città
    // cammino_urbano senza traccia (distanza/dislivello a zero producono comunque un punteggio,
    // mai un valore che abbia senso mostrare). Nessun controllo aggiuntivo sui dati qui (a
    // differenza di useCtsRecompute/handleComputeCts in GuidaHub.tsx): computeSafetyForHike
    // gestisce già da sé l'assenza di una traccia (computeSafetyCore degrada senza l'arricchimento
    // fauna/cani/terreno, che richiede una polyline, ma calcola comunque un punteggio dalle sole
    // cifre — legittimo per un Sentiero inserito a mano senza GPS, vedi app/upload/page.tsx).
    if (!metaEligibleForHikingScores(hike)) return
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
