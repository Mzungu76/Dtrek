'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { Locate } from 'lucide-react'

interface Props {
  /** The traveled path so far — grows as fixes arrive, unlike NavigationMap.tsx's fixed planned route. */
  path: [number, number][]
  position: { lat: number; lon: number } | null
  bearingDeg: number | null
  accuracyM?: number | null
}

const FOLLOW_ZOOM = 17
const MARKER_COLOR = '#0284c7' // same accent as the rest of app/navigatore — no NavState here (no plan to be on/off of), so a single fixed color rather than NavigationMap.tsx's per-state palette.

// Same tile source as NavigationMap.tsx (app/api/tile's CartoDB Voyager proxy) — a free-track
// recording and a planned navigation should look like the same app, not two different products.
const TILE_URL = '/api/tile?z={z}&x={x}&y={y}&style=voyager'

/**
 * Leaflet map for the no-plan "just track my position" recording screen
 * (app/navigatore/traccia/page.tsx) — deliberately the same tile source, marker style and
 * follow/recenter behavior as NavigationMap.tsx's full planned-route navigator, just without a
 * planned route/POIs/direction-arrows to draw, since there isn't one here. Drawing the traveled
 * path itself is this screen's only "route" concept.
 */
export default function FreeTrackMap({ path, position, bearingDeg, accuracyM }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const trackLine = useRef<L.Polyline | null>(null)
  const userMarker = useRef<L.Marker | null>(null)
  const accuracyCircle = useRef<L.Circle | null>(null)
  const hasCentered = useRef(false)
  const [followMode, setFollowMode] = useState(true)

  useEffect(() => {
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(
        position ? [position.lat, position.lon] : (path[0] ? [path[0][0], path[0][1]] : [41.9, 12.5]),
        16,
      )
      L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map)
      map.on('dragstart zoomstart', () => setFollowMode(false))
      mapInstance.current = map
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => { cancelled = true; mapInstance.current?.remove(); mapInstance.current = null; trackLine.current = null; userMarker.current = null; accuracyCircle.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (path.length < 2 || !mapInstance.current) return
    import('leaflet').then((L) => {
      const map = mapInstance.current
      if (!map) return
      if (trackLine.current) {
        trackLine.current.setLatLngs(path)
      } else {
        trackLine.current = L.polyline(path, { color: MARKER_COLOR, weight: 4, opacity: 0.85 }).addTo(map)
      }
    })
  }, [path])

  useEffect(() => {
    if (!position || !mapInstance.current) return
    import('leaflet').then((L) => {
      const map = mapInstance.current
      if (!map) return
      const rotation = bearingDeg ?? 0
      const icon = L.divIcon({
        className: '',
        html: `<div style="transform:rotate(${rotation}deg);width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="${MARKER_COLOR}" stroke="white" stroke-width="1.5"><path d="M12 2 L20 20 L12 16 L4 20 Z"/></svg>
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

      if (accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0) {
        if (accuracyCircle.current) {
          accuracyCircle.current.setLatLng([position.lat, position.lon])
          accuracyCircle.current.setRadius(accuracyM)
        } else {
          accuracyCircle.current = L.circle([position.lat, position.lon], {
            radius: accuracyM, color: MARKER_COLOR, weight: 1, fillColor: MARKER_COLOR, fillOpacity: 0.12, interactive: false,
          }).addTo(map)
        }
      } else if (accuracyCircle.current) {
        accuracyCircle.current.remove()
        accuracyCircle.current = null
      }

      if (!hasCentered.current) { map.setView([position.lat, position.lon], FOLLOW_ZOOM); hasCentered.current = true }
      else if (followMode) map.panTo([position.lat, position.lon], { animate: true, duration: 0.5 })
    })
  }, [position, bearingDeg, accuracyM, followMode])

  const handleRecenter = () => {
    setFollowMode(true)
    if (position && mapInstance.current) mapInstance.current.setView([position.lat, position.lon], FOLLOW_ZOOM)
  }

  return (
    <div className="absolute inset-0">
      <div ref={mapRef} className="absolute inset-0" />
      <button
        onClick={handleRecenter}
        className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full shadow-lg flex items-center justify-center ${followMode ? 'bg-terra-500 text-white' : 'bg-white text-stone-700'}`}
        aria-label="Centra sulla mia posizione"
      >
        <Locate className="w-5 h-5" />
      </button>
    </div>
  )
}
