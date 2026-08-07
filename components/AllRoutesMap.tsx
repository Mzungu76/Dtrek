'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { ROUTE_COLORS } from '@/lib/designTokens'

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

// Palette condivisa (lib/designTokens.ts), non più una copia locale: prima questo file, la
// legenda del diario e i raster generati per il PDF avevano ciascuno la propria lista di colori,
// quindi lo stesso percorso poteva risultare di un colore sulla mappa a schermo e di un altro
// nella legenda o nel PDF.
const PALETTE = ROUTE_COLORS

export default function AllRoutesMap({ routes, height = '500px', interactive = true }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const validRoutes = routes.filter(r => r.polyline && r.polyline.length > 1)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (validRoutes.length === 0) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      // Fix icone Leaflet con Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl: '/leaflet/marker-icon.png',
        shadowUrl: '/leaflet/marker-shadow.png',
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

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
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

      // Leaflet misura il contenitore una volta, alla creazione, e non si accorge da solo se le
      // sue dimensioni cambiano dopo — cosa che qui succede spesso: il Diario ricalcola il layout
      // del libro (scala e altezza) man mano che foto e trackpoint arrivano in background dopo il
      // render iniziale (vedi app/diario/page.tsx), e ogni volta le mappe già montate restavano
      // con tile mancanti ai bordi o il tracciato non centrato, finché non si toccava manualmente
      // la mappa. Senza questo osservatore Leaflet non lo saprebbe mai.
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro
    })

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
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
