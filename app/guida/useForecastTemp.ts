'use client'
import { useEffect, useState } from 'react'
import type { PlannedHike } from '@/lib/plannedStore'
import { getTrailStartPoint } from '@/lib/drivingInfo'
import { fetchDayHourly } from '@/lib/openmeteo'

/**
 * Temperatura media prevista (°C) nel giorno pianificato dell'escursione, al punto di partenza
 * del tracciato — usata da Trail Score v2 (lib/trailScoreV2.ts) per pesare stagionalmente Ombra e
 * Acqua nel Value (conta di più nelle giornate calde, quasi nulla sotto i 15°C). null quando manca
 * una data pianificata, il tracciato non ha coordinate, o la data è troppo lontana nel
 * passato/futuro perché Open-Meteo abbia dati (fetchDayHourly copre fino a 16 giorni in avanti,
 * nessun limite verso il passato) — Trail Score v2 degrada correttamente ai pesi statici (0.78/
 * 0.22) quando questo hook restituisce null, non è un caso d'errore da gestire a parte.
 */
export function useForecastTemp(hike: PlannedHike | null): number | null {
  const [tempC, setTempC] = useState<number | null>(null)

  useEffect(() => {
    setTempC(null)
    if (!hike) return
    const point = getTrailStartPoint(hike)
    if (!hike.plannedDate || !point) return
    let cancelled = false
    fetchDayHourly(point[0], point[1], hike.plannedDate)
      .then(hours => {
        if (cancelled || hours.length === 0) return
        const avg = hours.reduce((s, h) => s + h.temperature, 0) / hours.length
        setTempC(avg)
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hike?.id, hike?.plannedDate])

  return tempC
}
