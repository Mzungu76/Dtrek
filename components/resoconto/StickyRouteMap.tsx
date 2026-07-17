'use client'

import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'

interface Props {
  trackPoints: TrackPoint[]
  /** 0..1 lungo il percorso — indica dove si trova il lettore in base al capitolo attivo, o
   *  `null` mentre è aperta una sezione "dati" non legata a un punto preciso (es. Natura). */
  progress: number | null
  height?: string
}

/**
 * Mini-mappa sticky nella colonna del sommario (solo desktop largo, vedi ReportReader.tsx) — un
 * unico marker che segue il capitolo che si sta leggendo, così anche da desktop si percepisce
 * dove ci si trova lungo il percorso senza dover aprire "Andamento". Monta una volta sola
 * (come app/components/RoutePhotoMap.tsx) e sposta il marker via setLatLng invece di rimontare
 * la mappa a ogni cambio di sezione.
 */
export default function StickyRouteMap({ trackPoints, progress, height = '140px' }: Props) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markerRef   = useRef<L.Marker | null>(null)

  const gpsPoints = trackPoints.filter(p => p.lat && p.lon)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || gpsPoints.length < 2) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return
      const coords: [number, number][] = gpsPoints.map(p => [p.lat!, p.lon!])
      const map = L.map(mapRef.current, {
        zoomControl: false, attributionControl: false, scrollWheelZoom: false,
        dragging: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false,
      }).setView(coords[0], 13)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { maxZoom: 19 }).addTo(map)
      const poly = L.polyline(coords, { color: '#277134', weight: 3, opacity: 0.85 }).addTo(map)
      map.fitBounds(poly.getBounds(), { padding: [10, 10] })

      const icon = L.divIcon({
        html: '<div style="width:12px;height:12px;border-radius:50%;background:#d97220;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>',
        iconSize: [12, 12], iconAnchor: [6, 6], className: '',
      })
      markerRef.current = L.marker(coords[0], { icon, opacity: 0 }).addTo(map)
    })

    return () => {
      cancelled = true
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const marker = markerRef.current
    if (!marker || gpsPoints.length < 2) return
    if (progress == null) { marker.setOpacity(0); return }
    const idx = Math.min(gpsPoints.length - 1, Math.max(0, Math.round(progress * (gpsPoints.length - 1))))
    const pt = gpsPoints[idx]
    if (pt.lat && pt.lon) {
      marker.setLatLng([pt.lat, pt.lon])
      marker.setOpacity(1)
    }
  }, [progress]) // eslint-disable-line react-hooks/exhaustive-deps

  if (gpsPoints.length < 2) return null

  return <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden" />
}
