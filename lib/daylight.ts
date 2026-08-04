// Sunrise/sunset/dusk for the daylight countdown and turn-back advisory in the live navigator.
// Uses suncalc rather than a hand-rolled NOAA formula: sunset/dusk math has enough subtlety
// (equation of time, atmospheric refraction) that a from-scratch implementation risks silent
// errors in a safety-relevant number, and the library is tiny with no transitive dependencies.
import { getTimes } from 'suncalc'

export interface SunTimes {
  // null only at latitudes where the event doesn't occur that day (polar day/night) — never
  // in practice for this app's Italian/Alpine coverage area, but suncalc's own types are
  // honest about it, so this stays nullable rather than force-casting it away.
  sunrise: Date | null
  sunset: Date | null
  dawn: Date | null
  dusk: Date | null // civil twilight end — the true "no more usable light" cutoff
}

export function getSunTimes(lat: number, lon: number, date: Date): SunTimes {
  const times = getTimes(date, lat, lon)
  return { sunrise: times.sunrise, sunset: times.sunset, dawn: times.dawn, dusk: times.dusk }
}

/** Minutes between an ETA and sunset — positive means arriving before sunset, negative after. */
export function daylightMarginMinutes(etaDate: Date, sunset: Date | null): number | null {
  return sunset ? (sunset.getTime() - etaDate.getTime()) / 60000 : null
}

// ── Posizione del sole nel cielo ──────────────────────────────────────────────

import { getPosition } from 'suncalc'

export interface SunPosition {
  /** Azimut come una bussola: 0 = nord, 90 = est, 180 = sud, 270 = ovest. */
  azimuthDeg: number
  /** Altezza sull'orizzonte in gradi. Negativa quando il sole è già tramontato. */
  altitudeDeg: number
}

/**
 * Dove sta il sole, visto da un punto e in un istante.
 *
 * ATTENZIONE alla versione di suncalc. La 1.x — quella descritta da praticamente ogni esempio in
 * giro — restituisce radianti con l'azimut misurato **da sud**, e va convertita. La 2.x installata
 * qui restituisce già gradi con l'azimut **da nord** in senso orario (0 = N, 90 = E, 180 = S,
 * 270 = O), cioè esattamente la convenzione che servono a MapLibre
 * (`hillshade-illumination-direction`) e al resto dell'app (lib/navigation/orientation.ts): i
 * valori si passano così come sono.
 *
 * Applicare la conversione della 1.x a questa versione produce ombre che sembrano plausibili ma
 * arrivano dalla parte opposta del cielo — un errore che a occhio non si nota e che quindi va
 * tenuto in un punto solo, con questa nota accanto. Il normalizzatore qui sotto serve solo a
 * garantire l'intervallo 0-360 ai chiamanti, non a cambiare convenzione.
 */
export function getSunPosition(lat: number, lon: number, date: Date): SunPosition {
  const pos = getPosition(date, lat, lon)
  return {
    azimuthDeg: ((pos.azimuth % 360) + 360) % 360,
    altitudeDeg: pos.altitude,
  }
}

/**
 * Come illuminare il terreno per un sole in quella posizione.
 *
 * Il sole basso non fa solo ombre più lunghe: le fa anche più calde e più contrastate, ed è
 * esattamente ciò che distingue un'alba da mezzogiorno guardando una fotografia. L'esagerazione
 * cresce quindi al calare del sole, e i colori virano verso l'ambra.
 *
 * Sotto l'orizzonte non si continua a interpolare: si passa a una resa crepuscolare fredda e
 * piatta. Un sole a -10° con la formula del giorno darebbe ombre lunghissime e dorate, cioè il
 * contrario di quello che si vede davvero dopo il tramonto.
 */
export interface TerrainSunLook {
  /** Direzione da cui arriva la luce, in gradi bussola — `hillshade-illumination-direction`. */
  illuminationDirection: number
  exaggeration: number
  highlightColor: string
  shadowColor: string
  accentColor: string
  /** Angolo polare per `sky-atmosphere-sun` (0 = allo zenit, 90 = all'orizzonte). */
  skyPolar: number
}

export function terrainSunLook(sun: SunPosition): TerrainSunLook {
  const alt = sun.altitudeDeg
  const skyPolar = Math.max(0, Math.min(90, 90 - alt))

  if (alt <= 0) {
    return {
      illuminationDirection: sun.azimuthDeg,
      exaggeration: 0.18,
      highlightColor: 'rgba(150,170,200,0.30)',
      shadowColor: 'rgba(20,28,45,0.55)',
      accentColor: 'rgba(40,55,80,0.35)',
      skyPolar,
    }
  }
  // 0° → luce radente, 55°+ → sole alto. Oltre non serve continuare a schiacciare: a mezzogiorno
  // d'estate il rilievo è già il più piatto che sarà.
  const high = Math.min(1, alt / 55)
  const low = 1 - high
  const exaggeration = 0.28 + 0.42 * low
  const warm = Math.round(120 * low)
  return {
    illuminationDirection: sun.azimuthDeg,
    exaggeration,
    highlightColor: `rgba(255,${245 - Math.round(35 * low)},${225 - warm},${0.32 + 0.22 * low})`,
    shadowColor: `rgba(${40 + Math.round(20 * low)},32,${60 - Math.round(20 * low)},${0.30 + 0.28 * low})`,
    accentColor: `rgba(90,70,60,${0.18 + 0.16 * low})`,
    skyPolar,
  }
}
