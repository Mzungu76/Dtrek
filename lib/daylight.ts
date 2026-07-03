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
