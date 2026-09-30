// Weather signal — pioggia recente + umidità del suolo al centroide del percorso, modulate dalla
// superficie (tag OSM già risolti da osmTags.ts via ctx) e dalla pendenza media (in ctx).
// Al momento senza fonte dati: vedi collectWeatherSignal.
import type { WeatherSignal, SignalContext } from './types'

export async function collectWeatherSignal(_osmRelationId: number, ctx: SignalContext): Promise<WeatherSignal> {
  const surfaceMultiplier = surfaceMultiplierFor(ctx.osmTags.surface)
  const slopeMultiplier = slopeMultiplierFor(ctx)

  // Pioggia degli ultimi 7 giorni e umidità del suolo venivano dall'archivio di Open-Meteo, il cui
  // piano gratuito è solo non commerciale; MET Norway non ha lo storico. Finché non c'è una fonte
  // storica gratuita anche per uso commerciale il segnale è "non disponibile" (totalPenalty 0 NON
  // significa condizioni buone: unavailable lo dice ai chiamanti a valle).
  return { precipPenalty: 0, soilPenalty: 0, surfaceMultiplier, slopeMultiplier, totalPenalty: 0, unavailable: true }
}

function surfaceMultiplierFor(surface: string | undefined): number {
  if (!surface) return 1.2
  if (surface === 'gravel' || surface === 'rock') return 0.5
  if (surface === 'ground' || surface === 'earth') return 1.0
  if (surface === 'mud') return 1.5
  return 1.2
}

function slopeMultiplierFor(ctx: SignalContext): number {
  const { distanceKm, elevationGain, elevationLoss } = ctx
  if (!distanceKm || distanceKm <= 0 || elevationGain == null || elevationLoss == null) return 1.0
  const slopePercent = ((elevationGain + elevationLoss) / (distanceKm * 1000)) * 100
  if (slopePercent < 10) return 0.8
  if (slopePercent <= 25) return 1.0
  return 1.3
}
