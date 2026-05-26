import type { StoredActivity } from '@/lib/blobStore'

export function exportActivityToGpx(activity: StoredActivity): void {
  const pts = activity.trackPoints
    .filter(p => p.lat !== undefined && p.lon !== undefined)
    .map(p => {
      const ele = p.altitudeMeters !== undefined ? `\n        <ele>${p.altitudeMeters.toFixed(1)}</ele>` : ''
      const time = p.time ? `\n        <time>${p.time}</time>` : ''
      const hr = p.heartRateBpm !== undefined
        ? `\n        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.heartRateBpm}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`
        : ''
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}${time}${hr}\n      </trkpt>`
    })
    .join('\n')

  const name = (activity.title ?? activity.notes ?? 'Escursione').replace(/[<>&'"]/g, '')
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DtrekApp"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>${name}</name>
    <time>${activity.startTime}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`

  const blob = new Blob([gpx], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/\s+/g, '_')}.gpx`
  a.click()
  URL.revokeObjectURL(url)
}
