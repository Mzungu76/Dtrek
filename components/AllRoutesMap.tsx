'use client'
import { useEffect, useRef } from 'react'

interface RouteEntry {
  id: string
  title: string
  startTime: string
  polyline: [number, number][]
}

interface Props {
  routes: RouteEntry[]
  height?: string
  interactive?: boolean
}

const PALETTE = [
  '#378d44',
  '#c05a17',
  '#2563eb',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#d97706',
  '#059669',
]

export default function AllRoutesMap({ routes, height = '500px', interactive = true }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const validRoutes = routes.filter(r => r.polyline && r.polyline.length > 1)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (validRoutes.length === 0) return

    // Carica CSS Leaflet
    if (!document.querySelector('#leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      // Fix icone Leaflet con Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, {
        dragging: interactiveRef.current,
        scrollWheelZoom: interactiveRef.current,
        doubleClickZoom: interactiveRef.current,
        touchZoom: interactiveRef.current,
        boxZoom: interactiveRef.current,
        keyboard: interactiveRef.current,
      }).setView([44, 11], 7)
      mapInstance.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const allBounds: L.LatLngBounds[] = []

      validRoutes.forEach((route, idx) => {
        const color = PALETTE[idx % PALETTE.length]
        const coords: [number, number][] = route.polyline

        const polyline = L.polyline(coords, {
          color,
          weight: 4,
          opacity: 0.85,
          smoothFactor: 1.5,
        }).addTo(map)

        const dateStr = (() => {
          try {
            return new Date(route.startTime).toLocaleDateString('it-IT', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })
          } catch {
            return route.startTime
          }
        })()

        polyline.bindPopup(
          `<strong style="color:${color}">${route.title}</strong><br/><span style="font-size:12px;color:#666">${dateStr}</span>`
        )

        allBounds.push(polyline.getBounds())
      })

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0])
        map.fitBounds(combined, { padding: [24, 24] })
      }
    })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    const handlers = [map.dragging, map.scrollWheelZoom, map.doubleClickZoom, map.touchZoom, map.boxZoom, map.keyboard]
    handlers.forEach(h => { if (h) interactive ? h.enable() : h.disable() })
  }, [interactive])

  if (validRoutes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400 text-sm"
        style={{ height }}
      >
        Nessun percorso GPS disponibile
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
