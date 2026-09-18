'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import type { ItineraryLeg, ItineraryStop } from '@/app/api/borgo-itinerary/route'

interface Props {
  center: { lat: number; lon: number }
  stops: ItineraryStop[]
  legs: ItineraryLeg[]
  color: string
  height?: string
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
}

/** Mappa dell'itinerario a piedi di un Borgo/Città — un tracciato reale (leg.real) disegnato pieno,
 *  una linea d'aria di ripiego (nessun cammino trovato per quella tappa) tratteggiata, mai lo
 *  stesso stile per entrambi: l'utente deve poter distinguere a colpo d'occhio dove la mappa sta
 *  davvero seguendo le vie e dove sta solo indicando una direzione. Marker numerati nell'ordine di
 *  visita, il Borgo stesso come punto di partenza (0). */
export default function ItineraryMap({ center, stops, legs, color, height = '320px' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(mapRef.current!, { scrollWheelZoom: false })
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const boundsPoints: [number, number][] = [[center.lat, center.lon], ...stops.map(s => [s.lat, s.lon] as [number, number])]

      for (const leg of legs) {
        L.polyline(leg.polyline, {
          color,
          weight: 4,
          opacity: leg.real ? 0.85 : 0.6,
          dashArray: leg.real ? undefined : '6 8',
        }).addTo(map)
      }

      function numberedIcon(n: string, bg: string) {
        return L.divIcon({
          className: '',
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${bg};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700">${n}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          popupAnchor: [0, -13],
        })
      }

      const startMarker = L.marker([center.lat, center.lon], { icon: numberedIcon('B', '#44403c') })
      startMarker.bindPopup(`<strong>Partenza</strong>`)
      startMarker.addTo(map)

      stops.forEach((stop, i) => {
        const marker = L.marker([stop.lat, stop.lon], { icon: numberedIcon(String(i + 1), color) })
        marker.bindPopup(`<strong>${i + 1}. ${escapeHtml(stop.name)}</strong>`)
        marker.addTo(map)
      })

      if (boundsPoints.length > 0) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [24, 24] })
      } else {
        map.setView([center.lat, center.lon], 15)
      }

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

  return <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden border border-stone-200" />
}
