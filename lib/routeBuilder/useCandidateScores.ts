'use client'
// Calcola Trail Score + Sicurezza per una lista di candidati (costruiti o trovati) non appena
// arrivano — stessa pipeline usata per un percorso già salvato (computeCtsCore/computeSafetyCore,
// vedi lib/computeCtsForHike.ts e lib/computeSafetyForHike.ts). Estratto da
// components/upload/RouteBuilder.tsx (era un useEffect locale legato a `results`) perché anche
// app/percorsi-per-te/page.tsx deve calcolare gli stessi due anelli per le proprie card, senza
// duplicare l'effetto. NOTA: computeCtsCore/computeSafetyCore fanno fetch a URL relativi
// (/api/pois, /api/tei-dtm...) — funzionano solo lato browser, quindi questo hook (e chi lo importa)
// deve restare client-side; nessun percorso server-side calcola mai questi punteggi.
import { useEffect, useState } from 'react'
import { computeCtsCore } from '@/lib/computeCtsForHike'
import { computeSafetyCore } from '@/lib/computeSafetyForHike'
import { computeTrailScoreV2 } from '@/lib/trailScoreV2'
import type { TrackPoint } from '@/lib/tcxParser'

export interface CandidateScorePreview {
  total: number | null
  safety: { overall: number; color: string; label: string } | null
  vetoed: boolean
  loading: boolean
}

// Forma minima richiesta dall'unione di CtsCoreInput (lib/computeCtsForHike.ts) e SafetyCoreInput
// (lib/computeSafetyForHike.ts) — sia un BuiltCandidate (ScoredCandidate) sia il `track` di un
// FoundRouteItem la soddisfano già.
export interface ScorableHike {
  trackPoints: TrackPoint[]
  routePolyline?: [number, number][]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
}

// IMPORTANTE per chi chiama: `hikes` va memoizzato (es. `useMemo(() => results.map(...), [results])`)
// dal chiamante — l'effetto qui sotto dipende dalla IDENTITÀ dell'array (stesso pattern del
// `useEffect` originale legato a `results`, una vera variabile di stato). Passare un `.map()`
// inline non memoizzato creerebbe un array nuovo a ogni render, rifacendo ripartire il calcolo dei
// punteggi (e le relative fetch) ad ogni render invece che solo quando i candidati cambiano davvero.
export function useCandidateScores(hikes: ScorableHike[]): (CandidateScorePreview | null)[] {
  const [scores, setScores] = useState<(CandidateScorePreview | null)[]>([])

  useEffect(() => {
    if (hikes.length === 0) { setScores([]); return }
    setScores(hikes.map(() => ({ total: null, safety: null, vetoed: false, loading: true })))
    hikes.forEach((hike, i) => {
      Promise.all([
        computeCtsCore(hike).catch(() => null),
        computeSafetyCore(hike).catch(() => null),
      ]).then(([cts, safety]) => {
        const v2 = computeTrailScoreV2({ cts: cts?.ts ?? null, safety: safety?.overall ?? null })
        setScores(prev => {
          if (prev.length !== hikes.length) return prev
          const next = [...prev]
          next[i] = {
            total: v2?.score ?? null,
            safety: safety ? { overall: safety.overall, color: safety.color, label: safety.label } : null,
            vetoed: v2?.breakdown.vetoed ?? false,
            loading: false,
          }
          return next
        })
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hikes])

  return scores
}
