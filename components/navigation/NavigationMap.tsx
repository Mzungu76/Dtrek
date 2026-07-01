'use client'
import { useEffect, useRef } from 'react'
import type { NavState } from '@/lib/navigation/types'

interface Props {
  routePolyline: [number, number][]
  pois: { id: string | number; lat: number; lon: number; name?: string }[]
  position: { lat: number; lon: number } | null
  bearingDeg: number | null
  state: NavState
  tileUrlTemplate?: string // defaults to the CartoDB/OSM raster proxy, safe for the offline package (see /api/tile)
}

const STATE_COLOR: Record<NavState, string> = {
  idle: '#64748b',
  navigating: '#0ea5e9',
  poi_near: '#a855f7',
  off_route: '#f59e0b',
  gps_lost: '#ef4444',
  finished: '#22c55e',
}

/**
 * Leaflet-based full-screen navigation map: raster tiles (same /api/tile
 * proxy used offline, deliberately NOT MapLibre/MapTiler here — see the
 * offline-tile licensing note in the plan), static route polyline, POI
 * markers, and a rotating arrow for the live position. The map itself is
 * not rotated (Leaflet 1.9.4 core has no bearing support without a plugin);
 * instead the arrow icon rotates to point in the travel direction, which is
 * the simpler and safer choice for a first version.
 */
export default function NavigationMap({ routePolyline, pois, position, bearingDeg, state, tileUrlTemplate }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const userMarker = useRef<any>(null)
  const hasCentered = useRef(false)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(
        routePolyline[0] ? [routePolyline[0][0], routePolyline[0][1]] : [41.9, 12.5],
        16,
      )
      L.tileLayer(tileUrlTemplate ?? '/api/tile?z={z}&x={x}&y={y}&style=voyager', { maxZoom: 18 }).addTo(map)

      if (routePolyline.length > 1) {
        L.polyline(routePolyline, { color: '#0ea5e9', weight: 4, opacity: 0.8 }).addTo(map)
      }

      for (const poi of pois) {
        L.marker([poi.lat, poi.lon], { title: poi.name }).addTo(map)
      }

      mapInstance.current = map
    })
    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!position || !mapInstance.current) return
    import('leaflet').then((L) => {
      const map = mapInstance.current
      if (!map) return
      const color = STATE_COLOR[state]
      const rotation = bearingDeg ?? 0
      const icon = L.divIcon({
        className: '',
        html: `<div style="transform:rotate(${rotation}deg);width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 2 L20 20 L12 16 L4 20 Z"/></svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })
      if (userMarker.current) {
        userMarker.current.setLatLng([position.lat, position.lon])
        userMarker.current.setIcon(icon)
      } else {
        userMarker.current = L.marker([position.lat, position.lon], { icon, zIndexOffset: 1000 }).addTo(map)
      }
      if (!hasCentered.current) { map.setView([position.lat, position.lon], 17); hasCentered.current = true }
      else map.panTo([position.lat, position.lon], { animate: true, duration: 0.5 })
    })
  }, [position, bearingDeg, state])

  return <div ref={mapRef} className="absolute inset-0" />
}
