'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { Locate } from 'lucide-react'
import type { NavState } from '@/lib/navigation/types'

interface Props {
  routePolyline: [number, number][]
  pois: { id: string | number; lat: number; lon: number; name?: string }[]
  position: { lat: number; lon: number } | null
  bearingDeg: number | null
  state: NavState
  /** Nearby hiking paths/tracks (from OSM), drawn as thin context lines — the offline basemap alone has no sense of "what other paths pass near here", which matters for orientation on foot. */
  nearbyTrails?: [number, number][][]
  /** Current GPS fix accuracy in meters, drawn as a translucent circle around the position marker so the hiker can tell a trustworthy fix (few meters) from a noisy one (tens of meters, e.g. under tree cover). */
  accuracyM?: number | null
}

const FOLLOW_ZOOM = 17

const STATE_COLOR: Record<NavState, string> = {
  idle: '#64748b',
  navigating: '#277134',
  poi_near: '#d97220',
  off_route: '#f59e0b',
  gps_lost: '#ef4444',
  finished: '#22c55e',
}

// Always the 'voyager' raster style from /api/tile (CartoDB/OSM proxy) —
// this is the offline-safe map (see the offline-tile licensing note in the
// plan), so it deliberately doesn't offer the satellite/3D styles that live
// in NavigationMapLibre; those require network/MapTiler and aren't part of
// the downloaded offline package.
const TILE_URL = '/api/tile?z={z}&x={x}&y={y}&style=voyager'

/**
 * Leaflet-based full-screen navigation map with a live rotating arrow for
 * position/bearing. Auto-follows the hiker by default (Komoot-style); if the
 * hiker manually pans/zooms the map, follow mode turns off so their gesture
 * isn't fought, and a "recenter" button brings it back.
 */
export default function NavigationMap({ routePolyline, pois, position, bearingDeg, state, nearbyTrails, accuracyM }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const userMarker = useRef<L.Marker | null>(null)
  const accuracyCircle = useRef<L.Circle | null>(null)
  const hasCentered = useRef(false)
  const [followMode, setFollowMode] = useState(true)

  useEffect(() => {
    let cancelled = false

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(
        routePolyline[0] ? [routePolyline[0][0], routePolyline[0][1]] : [41.9, 12.5],
        16,
      )
      L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map)

      // Context layer, drawn under the main route: other nearby paths give a
      // hiker something to orient by (a fork, a shortcut, a parallel trail)
      // instead of just a blank basemap with one highlighted line on it.
      for (const line of nearbyTrails ?? []) {
        L.polyline(line, { color: '#8a7f6e', weight: 2, opacity: 0.55, dashArray: '1 6' }).addTo(map)
      }

      if (routePolyline.length > 1) {
        L.polyline(routePolyline, { color: '#277134', weight: 4, opacity: 0.8 }).addTo(map)
      }
      // Leaflet's built-in default marker icon resolves its image path
      // relative to leaflet.css's own URL, which breaks when the CSS is
      // injected via a plain <link> (see above) instead of bundled — every
      // L.marker() without an explicit icon 404s on marker-icon.png. A
      // small divIcon sidesteps that entirely instead of patching L.Icon.Default's path.
      const poiIcon = L.divIcon({
        className: '',
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#d97220;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
      for (const poi of pois) {
        L.marker([poi.lat, poi.lon], { title: poi.name, icon: poiIcon }).addTo(map)
      }

      // A manual pan/zoom means the hiker wants to look around — stop fighting them with auto-recenter.
      map.on('dragstart zoomstart', () => setFollowMode(false))

      mapInstance.current = map
      // The container may still have been zero-sized while CSS was loading — force a relayout once mounted.
      setTimeout(() => map.invalidateSize(), 0)
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

      // Leaflet's L.circle takes its radius directly in meters (unlike
      // MapLibre, no manual polygon math needed) — a quick trust signal for
      // the fix: a wide translucent ring means "don't trust this dot too
      // precisely" (weak signal / tree cover / canyon multipath).
      if (accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 0) {
        if (accuracyCircle.current) {
          accuracyCircle.current.setLatLng([position.lat, position.lon])
          accuracyCircle.current.setRadius(accuracyM)
        } else {
          accuracyCircle.current = L.circle([position.lat, position.lon], {
            radius: accuracyM, color: '#277134', weight: 1, fillColor: '#277134', fillOpacity: 0.12, interactive: false,
          }).addTo(map)
        }
      } else if (accuracyCircle.current) {
        accuracyCircle.current.remove()
        accuracyCircle.current = null
      }

      if (!hasCentered.current) { map.setView([position.lat, position.lon], FOLLOW_ZOOM); hasCentered.current = true }
      else if (followMode) map.panTo([position.lat, position.lon], { animate: true, duration: 0.5 })
    })
  }, [position, bearingDeg, state, followMode, accuracyM])

  const handleRecenter = () => {
    setFollowMode(true)
    // Instant, not animated: consistent with the online map's fix for the
    // same "recenter feels slow" report, and also resets zoom back to the
    // follow level (panning/pinching away is exactly what disengaged follow
    // mode in the first place).
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
