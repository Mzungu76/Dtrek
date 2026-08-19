// Parsing GPX lato server — a differenza di lib/gpxParser.ts (usato solo client-side, si
// appoggia al DOMParser del browser, non disponibile in una funzione Node.js) qui si usano regex
// mirate sui soli tag che servono. Usato solo per leggere il file GPX scaricato da una pagina
// fonte durante la ricerca percorsi con l'AI (vedi lib/gpxSourceFetch.ts) — non un parser XML
// generico, ma sufficiente per file GPX reali (stessa struttura standard <trk><trkpt lat lon>
// <ele>/<time></trkpt>) pubblicati da CAI/parchi/blog escursionistici.
import type { TrackPoint } from './tcxParser'
import { haversineM } from './geoUtils'

export interface ServerParsedGpx {
  title: string
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  trackPoints: TrackPoint[]
}

const TRKPT_RE = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi
const LAT_RE = /lat="([^"]+)"/i
const LON_RE = /lon="([^"]+)"/i
const ELE_RE = /<ele[^>]*>([^<]*)<\/ele>/i
const TIME_RE = /<time[^>]*>([^<]*)<\/time>/i
const NAME_RE = /<trk>[\s\S]*?<name>([^<]*)<\/name>/i
// DTREK-AUDIT.md P2 #27 — alcuni GPX (es. le esportazioni "togpx" del Sentiero Italia CAI, vedi
// lib/gpxParser.ts's extractGpxTitle) usano <name> con un figlio per lingua invece di un testo
// diretto: <name><it>SI Z17</it><en>SI Z17</en>...</name>. NAME_RE sopra (nessun tag annidato
// ammesso, [^<]*) semplicemente non fa match in quel caso — non concatena come farebbe un
// .textContent DOM, ma produce comunque un titolo vuoto invece del testo reale disponibile.
const NAME_IT_CHILD_RE = /<trk>[\s\S]*?<name>\s*<it[^>]*>([^<]*)<\/it>/i
const NAME_ANY_CHILD_RE = /<trk>[\s\S]*?<name>\s*<(\w+)[^>]*>([^<]*)<\/\1>/i

/**
 * Pura — stessa gerarchia di lib/gpxParser.ts's extractGpxTitle, via regex invece di DOM (questo
 * modulo gira lato server, senza DOMParser): testo diretto se <name> non ha figli, altrimenti il
 * figlio <it> o il primo figlio disponibile — mai la concatenazione di tutte le lingue.
 */
export function extractServerGpxTitle(xmlText: string): string {
  const direct = NAME_RE.exec(xmlText)
  if (direct?.[1]?.trim()) return direct[1].trim()
  const itChild = NAME_IT_CHILD_RE.exec(xmlText)
  if (itChild?.[1]?.trim()) return itChild[1].trim()
  const anyChild = NAME_ANY_CHILD_RE.exec(xmlText)
  return anyChild?.[2]?.trim() ?? ''
}

// Stesso schema di lib/gpxParser.ts's downsampleTracks — mantiene leggero il payload/cache.
function downsample(pts: TrackPoint[], max = 400): TrackPoint[] {
  if (pts.length <= max) return pts
  const step = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => pts[Math.min(Math.round(i * step), pts.length - 1)])
}

/** Ritorna null se il testo non contiene nessun <trkpt> valido (non un vero GPX, o vuoto). */
export function parseGpxServerSide(xmlText: string): ServerParsedGpx | null {
  const now = new Date().toISOString()
  const rawPoints: TrackPoint[] = []
  let m: RegExpExecArray | null
  TRKPT_RE.lastIndex = 0
  while ((m = TRKPT_RE.exec(xmlText)) !== null) {
    const [, attrs, body] = m
    const latM = LAT_RE.exec(attrs)
    const lonM = LON_RE.exec(attrs)
    if (!latM || !lonM) continue
    const lat = parseFloat(latM[1])
    const lon = parseFloat(lonM[1])
    if (isNaN(lat) || isNaN(lon)) continue
    const eleM = ELE_RE.exec(body)
    const timeM = TIME_RE.exec(body)
    const pt: TrackPoint = { time: timeM?.[1]?.trim() || now, lat, lon }
    if (eleM) pt.altitudeMeters = parseFloat(eleM[1])
    rawPoints.push(pt)
  }
  if (rawPoints.length === 0) return null

  let distanceMeters = 0, elevationGain = 0, elevationLoss = 0
  for (let i = 1; i < rawPoints.length; i++) {
    const p = rawPoints[i], q = rawPoints[i - 1]
    if (p.lat && p.lon && q.lat && q.lon) distanceMeters += haversineM(q.lat, q.lon, p.lat, p.lon)
    if (p.altitudeMeters !== undefined && q.altitudeMeters !== undefined) {
      const d = p.altitudeMeters - q.altitudeMeters
      // Dead-band against raw GPS-elevation noise — same threshold used for recorded
      // activities/FIT (gpxActivityParser.ts), otherwise every jitter inflates D+/D-.
      if (d > 0.5) elevationGain += d
      else if (d < -0.5) elevationLoss += Math.abs(d)
    }
  }

  const alts = rawPoints.filter(p => p.altitudeMeters !== undefined).map(p => p.altitudeMeters!)
  const altitudeMax = alts.length ? alts.reduce((a, b) => Math.max(a, b)) : 0
  const altitudeMin = alts.length ? alts.reduce((a, b) => Math.min(a, b)) : 0

  // Naismith's rule: 1h per 4 km + 1h per 300 m D+ — stessa formula di lib/gpxParser.ts.
  const distKm = distanceMeters / 1000
  const estimatedTimeSeconds = Math.round((distKm / 4 + elevationGain / 300) * 3600)

  return {
    title: extractServerGpxTitle(xmlText),
    distanceMeters: Math.round(distanceMeters),
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    altitudeMax: Math.round(altitudeMax),
    altitudeMin: Math.round(altitudeMin),
    estimatedTimeSeconds,
    trackPoints: downsample(rawPoints),
  }
}
