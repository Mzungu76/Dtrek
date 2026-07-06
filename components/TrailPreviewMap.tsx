'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

interface Props {
  polyline: [number, number][]
  height?: string
}

export default function TrailPreviewMap({ polyline, height = '220px' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current || polyline.length < 2) return

    // Destroy existing instance before re-init (React strict mode / hot reload)
    if (mapRef.current) {
      (mapRef.current as { remove(): void }).remove()
      mapRef.current = null
    }

    let cancelled = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
      })
      mapRef.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        maxZoom: 18,
        attribution: '© OpenStreetMap',
      }).addTo(map)

      L.control.attribution({ prefix: false }).addTo(map)

      const line = L.polyline(polyline, { color: '#2d7a3d', weight: 4, opacity: 0.9 }).addTo(map)
      map.fitBounds(line.getBounds(), { padding: [24, 24] })

      // Start / end markers
      const dotIcon = (color: string) => L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      })
      L.marker(polyline[0], { icon: dotIcon('#16a34a') }).addTo(map)
      L.marker(polyline[polyline.length - 1], { icon: dotIcon('#dc2626') }).addTo(map)
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove()
        mapRef.current = null
      }
    }
  }, [polyline])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-xl overflow-hidden bg-stone-100"
    />
  )
}
