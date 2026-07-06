'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

interface Props {
  polyline: [number, number][]
  height?: string
}

// Small static (no drag/zoom) map used in the trail preview modal so the user
// instantly recognizes the route shape instead of reading numbers alone.
export default function TrailMiniMap({ polyline, height = '160px' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || polyline.length < 2) return

    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return

      const map = L.map(mapRef.current, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      })
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const line = L.polyline(polyline, { color: '#dc2626', weight: 5, opacity: 0.95 }).addTo(map)
      map.fitBounds(line.getBounds(), { padding: [18, 18] })

      L.circleMarker(polyline[0], { radius: 5, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }).addTo(map)
      L.circleMarker(polyline[polyline.length - 1], { radius: 5, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }).addTo(map)
    })

    return () => {
      cancelled = true
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [polyline])

  if (polyline.length < 2) return null

  return <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden border border-stone-200" />
}
