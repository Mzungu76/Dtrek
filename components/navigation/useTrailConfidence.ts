'use client'
import { useEffect, useState } from 'react'
import { computeTrailConfidence, type TrailConfidenceResult } from '@/lib/navigation/trailConfidence'
import type { WeatherSignal, ClimateSignal, CommunitySignal } from '@/lib/trailConditions/types'

interface ConditionsResponse {
  weather: WeatherSignal
  climate: ClimateSignal
  community: CommunitySignal
}

// Fase 8 (seguito) di docs/navigator-orizzonti-roadmap.md — prima UI reale per
// computeTrailConfidence(), finora solo un modulo di calcolo senza consumatore. Riusa
// esattamente lo stesso endpoint/pattern di chiamata già in uso da
// components/CurrentConditionsNotice.tsx (query `polyline=`), non ne introduce uno nuovo.
//
// Un solo punteggio per l'intera escursione, non per segmento: gli input disponibili oggi
// (Trail Score di pianificazione, meteo/clima, community) sono già aggregati sull'intero
// percorso — un vero overlay "per tratto" avrebbe richiesto anche segnali per-segmento che non
// esistono ancora (vedi roadmap, "qualità geometrica"/"coerenza GPS live"/"qualità rete").
// Rifetch ogni 30 min, non ad ogni fix — le condizioni meteo/clima non cambiano più in fretta
// di così, stesso principio di useWeatherRefresh.ts (20 min) solo con una finestra più larga
// perché qui l'endpoint fa anche un match trail + lookup community, più costoso da ripetere.
const REFRESH_MS = 30 * 60 * 1000

export function useTrailConfidence(
  hikeId: string,
  routePolyline: [number, number][],
  trailScore: number | null,
): TrailConfidenceResult | null {
  const [result, setResult] = useState<TrailConfidenceResult | null>(null)

  useEffect(() => {
    if (routePolyline.length < 2) return
    let cancelled = false

    function refresh() {
      const qs = `polyline=${encodeURIComponent(JSON.stringify(routePolyline))}&planned_id=${encodeURIComponent(hikeId)}`
      fetch(`/api/trails/conditions?${qs}`)
        .then((res) => res.json())
        .then((data: ConditionsResponse | { error: string }) => {
          if (cancelled || 'error' in data) return
          setResult(computeTrailConfidence({
            trailScore,
            // null, non 0, quando Open-Meteo non ha risposto — un fallimento di rete non deve
            // pesare come "condizioni favorevoli" nella media di Trail Confidence (vedi
            // WeatherSignal/ClimateSignal.unavailable).
            weatherPenalty: data.weather.unavailable ? null : data.weather.totalPenalty,
            climatePenalty: data.climate.unavailable ? null : (data.climate.tempPenalty + data.climate.altitudeSeason + data.climate.seasonBonus),
            community: data.community,
          }))
        })
        .catch(() => {
          // Best-effort: nessun aggiornamento su fallimento, il badge resta con l'ultimo
          // valore noto (o nascosto, se non ne ha mai avuto uno) invece di sparire di scatto.
        })
    }

    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hikeId])

  return result
}
