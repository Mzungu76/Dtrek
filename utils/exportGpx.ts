import type { StoredActivity } from '@/lib/blobStore'
import type { PlannedHike } from '@/lib/plannedStore'

interface GpxPoint {
  lat?: number
  lon?: number
  altitudeMeters?: number
  time?: string
}

function buildGpx(points: GpxPoint[], name: string, metaTime?: string): string {
  const pts = points
    .filter(p => p.lat !== undefined && p.lon !== undefined)
    .map(p => {
      const ele = p.altitudeMeters !== undefined ? `\n        <ele>${p.altitudeMeters.toFixed(1)}</ele>` : ''
      const time = p.time ? `\n        <time>${p.time}</time>` : ''
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}${time}\n      </trkpt>`
    })
    .join('\n')

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
    <trkseg>
${pts}
    </trkseg>
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
  downloadGpx(buildGpx(pts, name, activity.startTime), name)
}

/** Esporta la traccia di un percorso di una guida (solo linea, nessun waypoint POI) — usa
 *  trackPoints quando disponibile (quota/orario inclusi), altrimenti routePolyline (solo lat/lon,
 *  percorsi trovati via OSM senza arricchimento quota) — stesso fallback già usato da
 *  components/guida/GuideHero.tsx per la mappa hero. */
export function exportPlannedHikeToGpx(hike: PlannedHike): void {
  const fromTrack = (hike.trackPoints ?? []).filter(p => p.lat !== undefined && p.lon !== undefined)
  const pts: GpxPoint[] = fromTrack.length > 1
    ? fromTrack.map(p => ({ lat: p.lat, lon: p.lon, altitudeMeters: p.altitudeMeters, time: p.time }))
    : (hike.routePolyline ?? []).map(([lat, lon]) => ({ lat, lon }))
  const name = hike.title || 'Percorso'
  downloadGpx(buildGpx(pts, name, hike.plannedDate), name)
}
