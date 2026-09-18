'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'

interface Props {
  lat: number
  lon: number
  color: string
  height?: string
  zoom?: number
  interactive?: boolean
  className?: string
}

/** Mappa a singolo pin — versione minima di AllRoutesMap.tsx (components/AllRoutesMap.tsx) per un
 *  punto invece di un tracciato: stesso motore Leaflet + stesso tile proxy (/api/tile), nessun
 *  fumetto/popup, un solo marker colorato per tipologia (lib/metaTypes.ts's META_TYPE_CONFIG). */
export default function PlacePinMap({ lat, lon, color, height = '220px', zoom = 13, interactive = false, className = 'rounded-xl overflow-hidden border border-stone-200' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      const map = L.map(mapRef.current!, {
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        zoomControl: interactive,
        attributionControl: false,
      }).setView([lat, lon], zoom)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { maxZoom: 19 }).addTo(map)

      L.circleMarker([lat, lon], {
        radius: 9,
        color: 'white',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(map)
    })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={mapRef} style={{ height }} className={className} />
}
