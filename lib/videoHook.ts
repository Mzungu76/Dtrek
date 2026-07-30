// Suggerisce i testi del "gancio" iniziale del video (Sezione 4: la primissima frazione di
// secondo, pensata per fermare lo scroll su Reels/TikTok/Shorts prima ancora di vedere la mappa).
// Due suggerimenti indipendenti — l'utente decide quali attivare e può riscrivere ciascuno:
// - suggestStatHookText: una cifra d'impatto, sempre disponibile (distanza/dislivello/quota).
// - suggestCuriosityHookText: un accenno a un punto di interesse notevole lungo il percorso, se
//   ce n'è uno — null altrimenti (nessun testo generico "di riserva": meglio nessuna frase che una
//   frase vuota di contenuto).
import type { PoiItem, PoiType } from './overpass'

const NOTABLE_TYPES: PoiType[] = [
  'waterfall', 'cave', 'ruins', 'castle', 'archaeological', 'monument', 'chapel', 'tower', 'bridge',
  'peak', 'hut', 'bivouac', 'pass', 'viewpoint', 'cross',
]

const POI_HOOK_PHRASE: Partial<Record<PoiType, string>> = {
  waterfall: 'una cascata nascosta', cave: 'una grotta', ruins: 'rovine antiche',
  castle: 'un castello', archaeological: 'un sito archeologico', monument: 'un monumento',
  chapel: 'una piccola chiesa', tower: 'una torre', bridge: 'un ponte storico',
  peak: 'una vetta panoramica', hut: 'un rifugio', bivouac: 'un bivacco',
  pass: 'un valico', viewpoint: 'un belvedere mozzafiato', cross: 'una croce di vetta',
}

export function suggestStatHookText(input: {
  distanceKm: number
  elevationGain: number
  altitudeMax?: number
}): string {
  if (input.elevationGain >= 700) return `+${Math.round(input.elevationGain)} M DI SALITA`
  if (input.altitudeMax && input.altitudeMax >= 1500) return `Fino a ${Math.round(input.altitudeMax)} M DI QUOTA`
  if (input.distanceKm >= 12) return `${input.distanceKm.toFixed(1)} KM TRA NATURA E SILENZIO`
  return `${input.distanceKm.toFixed(1)} KM · +${Math.round(input.elevationGain)} M`
}

export function suggestCuriosityHookText(pois?: PoiItem[]): string | null {
  const notable = (pois ?? []).find(p => NOTABLE_TYPES.includes(p.type))
  if (!notable) return null
  if (notable.name) return `Sai cosa si nasconde qui? ${notable.name}`
  const phrase = POI_HOOK_PHRASE[notable.type] ?? 'un punto di interesse'
  return `Lungo questo sentiero c'è ${phrase}`
}
