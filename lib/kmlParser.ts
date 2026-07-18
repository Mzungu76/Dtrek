// Parsing KML — regex mirato sui soli tag che servono, stesso approccio di
// lib/serverGpxParser.ts (nessun parser XML generico). A differenza del GPX (dove serve un
// parser diverso lato client/server, DOMParser vs regex), qui basta un'unica implementazione:
// pura manipolazione di stringhe, funziona identica in browser (import client-side, es.
// GpxUploader.tsx) e in una route API Node (lib/kmlSourceFetch.ts).
//
// Copre due strutture reali: <Placemark><LineString><coordinates> (la più comune, esportata da
// Google My Maps, siti di enti parco, la maggior parte dei tool "disegna un percorso"), e
// <gx:Track> con <gx:coord> (tracce registrate via Google Earth/alcuni GPS, con timestamp reali
// per punto). Se il documento contiene entrambe, vince gx:Track (dati di registrazione reale,
// non un disegno).
import type { TrackPoint } from './tcxParser'
import type { ServerParsedGpx } from './serverGpxParser'
import { haversineM } from './geoUtils'

const GX_TRACK_RE = /<gx:Track\b[^>]*>([\s\S]*?)<\/gx:Track>/i
const GX_COORD_RE = /<gx:coord>([^<]+)<\/gx:coord>/gi
const WHEN_RE = /<when>([^<]+)<\/when>/gi
const LINESTRING_RE = /<LineString\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi
const DOC_NAME_RE = /<Document\b[^>]*>[\s\S]*?<name>([^<]*)<\/name>/i
const ANY_NAME_RE = /<name>([^<]*)<\/name>/i

function downsample(pts: TrackPoint[], max = 400): TrackPoint[] {
  if (pts.length <= max) return pts
  const step = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => pts[Math.min(Math.round(i * step), pts.length - 1)])
}

// "lon,lat[,alt]" — separatore standard KML <coordinates> (a differenza di gx:coord, che usa
// lo spazio, vedi parseGxTrack sotto).
function parseLonLatAlt(tuple: string, sep: string | RegExp): TrackPoint | null {
  const parts = tuple.trim().split(sep).filter(Boolean)
  if (parts.length < 2) return null
  const lon = parseFloat(parts[0])
  const lat = parseFloat(parts[1])
  if (isNaN(lat) || isNaN(lon)) return null
  const pt: TrackPoint = { time: '', lat, lon }
  if (parts.length >= 3) {
    const alt = parseFloat(parts[2])
    if (!isNaN(alt)) pt.altitudeMeters = alt
  }
  return pt
}

function parseGxTrack(xmlText: string): TrackPoint[] | null {
  const trackMatch = GX_TRACK_RE.exec(xmlText)
  if (!trackMatch) return null
  const body = trackMatch[1]

  const whens: string[] = []
  let m: RegExpExecArray | null
  WHEN_RE.lastIndex = 0
  while ((m = WHEN_RE.exec(body)) !== null) whens.push(m[1].trim())

  const points: TrackPoint[] = []
  GX_COORD_RE.lastIndex = 0
  let i = 0
  while ((m = GX_COORD_RE.exec(body)) !== null) {
    const pt = parseLonLatAlt(m[1], /\s+/)
    if (pt) {
      pt.time = whens[i] || ''
      points.push(pt)
    }
    i++
  }
  return points.length > 0 ? points : null
}

function parseLineStrings(xmlText: string): TrackPoint[] | null {
  const points: TrackPoint[] = []
  let m: RegExpExecArray | null
  LINESTRING_RE.lastIndex = 0
  while ((m = LINESTRING_RE.exec(xmlText)) !== null) {
    const tuples = m[1].trim().split(/\s+/).filter(Boolean)
    for (const tuple of tuples) {
      const pt = parseLonLatAlt(tuple, ',')
      if (pt) points.push(pt)
    }
  }
  return points.length > 0 ? points : null
}

/** Ritorna null se il testo non contiene nessuna traccia riconoscibile (né gx:Track né
 *  LineString/coordinates) — non un vero KML di un percorso, o vuoto/solo marker puntuali. */
export function parseKml(xmlText: string): ServerParsedGpx | null {
  const now = new Date().toISOString()
  const rawPoints = parseGxTrack(xmlText) ?? parseLineStrings(xmlText)
  if (!rawPoints || rawPoints.length === 0) return null
  for (const p of rawPoints) if (!p.time) p.time = now

  let distanceMeters = 0, elevationGain = 0, elevationLoss = 0
  for (let i = 1; i < rawPoints.length; i++) {
    const p = rawPoints[i], q = rawPoints[i - 1]
    if (p.lat && p.lon && q.lat && q.lon) distanceMeters += haversineM(q.lat, q.lon, p.lat, p.lon)
    if (p.altitudeMeters !== undefined && q.altitudeMeters !== undefined) {
      const d = p.altitudeMeters - q.altitudeMeters
      if (d > 0) elevationGain += d; else elevationLoss += Math.abs(d)
    }
  }

  const alts = rawPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const altitudeMax = alts.length ? alts.reduce((a, b) => Math.max(a, b)) : 0
  const altitudeMin = alts.length ? alts.reduce((a, b) => Math.min(a, b)) : 0

  // Naismith's rule: 1h per 4 km + 1h per 300 m D+ — stessa formula di serverGpxParser.ts,
  // ignora deliberatamente i timestamp reali di un gx:Track (qui trattato come un percorso da
  // pianificare, non un'attività registrata: la stima deve valere anche per chi lo farà con un
  // passo diverso da chi l'ha tracciato).
  const distKm = distanceMeters / 1000
  const estimatedTimeSeconds = Math.round((distKm / 4 + elevationGain / 300) * 3600)

  const nameMatch = DOC_NAME_RE.exec(xmlText) ?? ANY_NAME_RE.exec(xmlText)

  return {
    title: nameMatch?.[1]?.trim() || '',
    distanceMeters: Math.round(distanceMeters),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    altitudeMax: Math.round(altitudeMax),
    altitudeMin: Math.round(altitudeMin),
    estimatedTimeSeconds,
    trackPoints: downsample(rawPoints),
  }
}
