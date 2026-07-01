'use client'
import { useEffect, useRef, useState } from 'react'
import { Locate, Layers } from 'lucide-react'
import type { NavState } from '@/lib/navigation/types'

interface Props {
  routePolyline: [number, number][]
  pois: { id: string | number; lat: number; lon: number; name?: string }[]
  position: { lat: number; lon: number } | null
  bearingDeg: number | null
  state: NavState
}

const STATE_COLOR: Record<NavState, string> = {
  idle: '#64748b',
  navigating: '#0ea5e9',
  poi_near: '#a855f7',
  off_route: '#f59e0b',
  gps_lost: '#ef4444',
  finished: '#22c55e',
}

// Raster styles served by /api/tile (CartoDB/OSM proxy) — deliberately not
// MapLibre/MapTiler vector styles here, see the offline-tile licensing note
// in the plan: this map must also work from the offline package.
const MAP_STYLES = ['voyager', 'light', 'dark'] as const

/**
 * Leaflet-based full-screen navigation map with a live rotating arrow for
 * position/bearing. Auto-follows the hiker by default (Komoot-style); if the
 * hiker manually pans/zooms the map, follow mode turns off so their gesture
 * isn't fought, and a "recenter" button (right-side toolbar, like Komoot's
 * crosshair icon) brings it back. A second button cycles the raster style.
 */
export default function NavigationMap({ routePolyline, pois, position, bearingDeg, state }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const tileLayer = useRef<any>(null)
  const userMarker = useRef<any>(null)
  const hasCentered = useRef(false)
  const [followMode, setFollowMode] = useState(true)
  const [styleIndex, setStyleIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(
        routePolyline[0] ? [routePolyline[0][0], routePolyline[0][1]] : [41.9, 12.5],
        16,
      )
      tileLayer.current = L.tileLayer(`/api/tile?z={z}&x={x}&y={y}&style=${MAP_STYLES[0]}`, { maxZoom: 18 }).addTo(map)

      if (routePolyline.length > 1) {
        L.polyline(routePolyline, { color: '#0ea5e9', weight: 4, opacity: 0.8 }).addTo(map)
      }
      for (const poi of pois) {
        L.marker([poi.lat, poi.lon], { title: poi.name }).addTo(map)
      }

      // A manual pan/zoom means the hiker wants to look around — stop fighting them with auto-recenter.
      map.on('dragstart zoomstart', () => setFollowMode(false))

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
      else if (followMode) map.panTo([position.lat, position.lon], { animate: true, duration: 0.5 })
    })
  }, [position, bearingDeg, state, followMode])

  const handleRecenter = () => {
    setFollowMode(true)
    if (position && mapInstance.current) mapInstance.current.panTo([position.lat, position.lon], { animate: true })
  }

  const handleCycleStyle = () => {
    const nextIndex = (styleIndex + 1) % MAP_STYLES.length
    setStyleIndex(nextIndex)
    if (tileLayer.current) tileLayer.current.setUrl(`/api/tile?z={z}&x={x}&y={y}&style=${MAP_STYLES[nextIndex]}`)
  }

  return (
    <div className="absolute inset-0">
      <div ref={mapRef} className="absolute inset-0" />
      <div className="absolute right-3 bottom-40 flex flex-col gap-2 z-10">
        <button
          onClick={handleRecenter}
          className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center ${followMode ? 'bg-sky-500 text-white' : 'bg-white text-slate-700'}`}
          aria-label="Centra sulla mia posizione"
        >
          <Locate className="w-5 h-5" />
        </button>
        <button onClick={handleCycleStyle} className="w-11 h-11 rounded-full bg-white text-slate-700 shadow-lg flex items-center justify-center" aria-label="Cambia stile mappa">
          <Layers className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
