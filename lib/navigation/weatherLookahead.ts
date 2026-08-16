// Fase 11 di docs/navigator-orizzonti-roadmap.md — proietta le condizioni meteo attese
// all'orario di arrivo stimato (PaceAssistant.liveEtaDate), non solo quelle attuali. Funzione
// pura: nessuna chiamata di rete qui, riceve l'array orario già scaricato da
// components/navigation/useWeatherRefresh.ts (stesso fetchDayHourly già in uso per la
// correzione meteo live del passo — nessuna nuova chiamata Open-Meteo introdotta da questa fase).
import type { HourlyWeatherFull } from '@/lib/openmeteo'

export interface WeatherLookahead {
  etaDate: Date
  /** Testo pronto per un avviso, null quando non c'è nulla da segnalare (condizioni stabili o
   *  già presenti anche ora — un avviso ha senso solo per un peggioramento, non per il "resta
   *  così per tutto il giorno"). */
  message: string | null
}

const RAIN_WARNING_MM = 1
const WIND_WARNING_KMH = 30

function closestHour(hours: HourlyWeatherFull[], atMs: number): HourlyWeatherFull {
  return hours.reduce((best, h) =>
    Math.abs(new Date(h.time).getTime() - atMs) < Math.abs(new Date(best.time).getTime() - atMs) ? h : best)
}

function formatHour(d: Date): string {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Confronta il bucket orario più vicino all'ETA con quello più vicino ad ora — avvisa solo se
 * il confronto peggiora (pioggia/vento assenti ora ma previsti all'arrivo), non se le
 * condizioni sono semplicemente "non ottimali" fin da subito.
 */
export function projectWeatherAtEta(hours: HourlyWeatherFull[], etaDate: Date, nowMs: number): WeatherLookahead | null {
  if (hours.length === 0) return null
  const nowHour = closestHour(hours, nowMs)
  const etaHour = closestHour(hours, etaDate.getTime())
  if (etaHour.time === nowHour.time) return null // stesso bucket orario — niente da proiettare

  const rainWorsening = etaHour.precipitation >= RAIN_WARNING_MM && nowHour.precipitation < RAIN_WARNING_MM
  const windWorsening = etaHour.windspeed >= WIND_WARNING_KMH && nowHour.windspeed < WIND_WARNING_KMH

  let message: string | null = null
  if (rainWorsening && windWorsening) message = `Pioggia e vento forte previsti verso le ${formatHour(etaDate)}`
  else if (rainWorsening) message = `Pioggia prevista verso le ${formatHour(etaDate)}`
  else if (windWorsening) message = `Vento forte previsto verso le ${formatHour(etaDate)}`

  return { etaDate, message }
}
