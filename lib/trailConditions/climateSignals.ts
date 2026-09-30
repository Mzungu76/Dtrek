// Climate signal — penalità quota/stagione e bonus di mezza stagione.
//
// La temperatura media del mese sugli ultimi 10 anni e la quota del punto venivano dall'API di
// Open-Meteo (archivio storico + elevation): il piano gratuito è solo per uso non commerciale, e
// MET Norway (usata ora per le previsioni) non ha storico. Finché non c'è una fonte storica gratuita
// anche per uso commerciale, il segnale risulta "non disponibile" — mai un dato inventato: resta
// solo il bonus di mezza stagione, che si calcola dal mese e non da una fonte esterna.
import type { ClimateSignal, SignalContext } from './types'

const SHOULDER_MONTHS = [4, 5, 10, 11] // Apr, Mag, Ott, Nov

export async function collectClimateSignal(_osmRelationId: number, _ctx: SignalContext): Promise<ClimateSignal> {
  const currentMonth = new Date().getMonth() + 1
  const seasonBonus = SHOULDER_MONTHS.includes(currentMonth) ? 5 : 0
  return { tempPenalty: 0, altitudeSeason: 0, seasonBonus, unavailable: true }
}
