'use client'
import { useEffect, useRef } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'

interface Props {
  trackPoints: TrackPoint[]
  height?: string
}

export default function MapView({ trackPoints, height = '400px' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const points = trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
    if (points.length === 0) return

    // Carica Leaflet dinamicamente (solo client)
    import('leaflet').then(L => {
      // Fix icone Leaflet con Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const coords: [number, number][] = points.map(p => [p.lat!, p.lon!])

      const map = L.map(mapRef.current!).setView(coords[0], 14)
      mapInstance.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Tracciato principale
      const polyline = L.polyline(coords, {
        color: '#378d44',
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1.5,
      }).addTo(map)

      // Marcatore start
      const startIcon = L.divIcon({
        html: `<div style="background:#378d44;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">S</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
      })

      // Marcatore end
      const endIcon = L.divIcon({
        html: `<div style="background:#c05a17;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">A</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
      })

      L.marker(coords[0], { icon: startIcon }).addTo(map).bindPopup('Partenza')
      L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(map).bindPopup('Arrivo')

      // Fit bounds
      map.fitBounds(polyline.getBounds(), { padding: [20, 20] })
    })

    // Carica CSS Leaflet
    if (!document.querySelector('#leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [trackPoints])

  const hasGps = trackPoints.some(p => p.lat !== undefined)

  if (!hasGps) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400 text-sm"
        style={{ height }}
      >
        Nessun dato GPS disponibile in questo file TCX
      </div>
    )
  }

  return (
    <div
      ref={mapRef}
      style={{ height }}
      className="rounded-xl overflow-hidden border border-stone-200 shadow-sm"
    />
  )
}
