import type { StoredActivity } from '@/lib/blobStore'
import type { PlannedHike } from '@/lib/plannedStore'
import { effectiveNavPolyline, splitPolylineByTappaEnds } from '@/lib/borgoWalkPolyline'

interface GpxPoint {
  lat?: number
  lon?: number
  altitudeMeters?: number
  time?: string
}

function trkseg(points: GpxPoint[]): string {
  const pts = points
    .filter(p => p.lat !== undefined && p.lon !== undefined)
    .map(p => {
      const ele = p.altitudeMeters !== undefined ? `\n        <ele>${p.altitudeMeters.toFixed(1)}</ele>` : ''
      const time = p.time ? `\n        <time>${p.time}</time>` : ''
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}${time}\n      </trkpt>`
    })
    .join('\n')
  return `    <trkseg>\n${pts}\n    </trkseg>`
}

/** `segments`: un `<trkseg>` per ogni voce — più di uno solo per un itinerario di Borgo/Città su
 *  più tappe/giornate (Navigator "Modalità A", sessione conversazionale), dove ogni tappa diventa
 *  il proprio segmento invece di un'unica traccia continua. È lo stesso standard con cui
 *  Garmin/Wikiloc/AllTrails rappresentano un trekking multi-giorno — qualunque dispositivo GPS
 *  esterno vede già la suddivisione, non solo l'app. Un solo segmento per ogni altro caso
 *  (Sentiero, Sito, Borgo a tappa unica). */
function buildGpx(segments: GpxPoint[][], name: string, metaTime?: string): string {
  const safeName = name.replace(/[<>&'"]/g, '')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DtrekApp"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>${safeName}</name>${metaTime ? `\n    <time>${metaTime}</time>` : ''}
  </metadata>
  <trk>
    <name>${safeName}</name>
${segments.map(trkseg).join('\n')}
  </trk>
</gpx>`
}

function downloadGpx(gpx: string, name: string): void {
  const blob = new Blob([gpx], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/\s+/g, '_')}.gpx`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportActivityToGpx(activity: StoredActivity): void {
  const pts = activity.trackPoints.map(p => ({
    lat: p.lat, lon: p.lon, altitudeMeters: p.altitudeMeters, time: p.time,
  }))
  const name = activity.title ?? activity.notes ?? 'Escursione'
  downloadGpx(buildGpx([pts], name, activity.startTime), name)
}

/** Esporta la traccia di un percorso di una guida (solo linea, nessun waypoint POI) — usa
 *  trackPoints quando disponibile (quota/orario inclusi), altrimenti la polyline effettiva
 *  (effectiveNavPolyline: routePolyline se c'è una traccia GPS reale, altrimenti borgoWalkPolyline
 *  per un Borgo/Città cammino_urbano — prima mancava del tutto questo ripiego, producendo un GPX
 *  vuoto per il caso più comune di Borgo). Un Borgo su più tappe produce un `<trkseg>` per tappa
 *  (splitPolylineByTappaEnds) — mai per trackPoints, una traccia GPS reale registrata in un'unica
 *  uscita resta un solo segmento anche quando collegata a un Borgo multi-tappa. */
export function exportPlannedHikeToGpx(hike: PlannedHike): void {
  const fromTrack = (hike.trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
  const segments: GpxPoint[][] = fromTrack.length > 1
    ? [fromTrack.map(p => ({ lat: p.lat, lon: p.lon, altitudeMeters: p.altitudeMeters, time: p.time }))]
    : splitPolylineByTappaEnds(effectiveNavPolyline(hike) ?? [], hike.borgoWalkTappaEnds)
        .map(segment => segment.map(([lat, lon]) => ({ lat, lon })))
  const name = hike.title || 'Percorso'
  downloadGpx(buildGpx(segments, name, hike.plannedDate), name)
}
