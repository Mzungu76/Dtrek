'use client'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { Locate } from 'lucide-react'
import { maptilerStyleUrl, MAPTILER_KEY, type MapTilerStyleId } from '@/lib/mapStyles'
import type { NavState } from '@/lib/navigation/types'

interface Props {
  routePolyline: [number, number][]
  pois: { id: string | number; lat: number; lon: number; name?: string }[]
  position: { lat: number; lon: number } | null
  bearingDeg: number | null
  state: NavState
  styleId: MapTilerStyleId
  is3D: boolean
  /** Called if the MapTiler style hasn't finished loading within a few seconds, or errors out (missing/invalid key, no connectivity) — the caller should fall back to the offline-safe map. */
  onStyleFailed?: () => void
}

const STYLE_LOAD_TIMEOUT_MS = 6000

const STATE_COLOR: Record<NavState, string> = {
  idle: '#64748b',
  navigating: '#0ea5e9',
  poi_near: '#a855f7',
  off_route: '#f59e0b',
  gps_lost: '#ef4444',
  finished: '#22c55e',
}

const ROUTE_SOURCE_ID = 'nav-route'
const ROUTE_LAYER_ID = 'nav-route-line'

/**
 * MapLibre GL variant of the navigation map: online only (needs MapTiler
 * vector tiles/styles, not part of the offline package — see
 * lib/mapStyles.ts and the offline-tile licensing note in the plan),
 * offering the same 3 styles as RouteMap3D's flythrough (Outdoor/
 * Satellite/Winter) plus a 3D pitch. The map itself stays north-up
 * (bearing 0) — only the position arrow rotates — for consistency with the
 * offline Leaflet map and to avoid disorienting the hiker with a spinning
 * view while walking.
 */
export default function NavigationMapLibre({ routePolyline, pois, position, bearingDeg, state, styleId, is3D, onStyleFailed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const userMarker = useRef<any>(null)
  const userMarkerArrow = useRef<HTMLDivElement | null>(null)
  const hasCentered = useRef(false)
  const styleWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [followMode, setFollowMode] = useState(true)

  /** Arms a timeout that reports style-load failure unless 'load'/'style.load' fires first — MapTiler gives no explicit signal for "key missing/invalid", it just never finishes loading. */
  const armStyleWatchdog = (map: any) => {
    if (styleWatchdog.current) clearTimeout(styleWatchdog.current)
    styleWatchdog.current = setTimeout(() => onStyleFailed?.(), STYLE_LOAD_TIMEOUT_MS)
    const clear = () => { if (styleWatchdog.current) { clearTimeout(styleWatchdog.current); styleWatchdog.current = null } }
    map.once('load', clear)
    map.once('style.load', clear)
    map.once('error', () => { clear(); onStyleFailed?.() })
  }

  const setupRouteLayer = (maplibregl: any) => {
    const map = mapRef.current
    if (!map || routePolyline.length < 2) return
    const geojson = {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: routePolyline.map(([lat, lon]) => [lon, lat]) },
      properties: {},
    }
    if (map.getSource(ROUTE_SOURCE_ID)) {
      map.getSource(ROUTE_SOURCE_ID).setData(geojson)
    } else {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson })
      map.addLayer({ id: ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID, paint: { 'line-color': '#0ea5e9', 'line-width': 4, 'line-opacity': 0.85 } })
    }
  }

  useEffect(() => {
    if (!MAPTILER_KEY && process.env.NODE_ENV !== 'production') {
      console.warn('NavigationMapLibre: NEXT_PUBLIC_MAPTILER_KEY is empty — the online map styles will fail to load and fall back to offline.')
    }
    let cancelled = false
    import('maplibre-gl').then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const maplibregl = mod.default ?? mod
      const start: [number, number] = routePolyline[0] ? [routePolyline[0][1], routePolyline[0][0]] : [12.5, 41.9]
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: maptilerStyleUrl(styleId),
        center: start, zoom: 15, pitch: is3D ? 55 : 0, bearing: 0,
      })
      mapRef.current = map
      armStyleWatchdog(map)

      map.on('load', () => {
        setupRouteLayer(maplibregl)
        for (const poi of pois) {
          const marker = new maplibregl.Marker().setLngLat([poi.lon, poi.lat]).addTo(map)
          markersRef.current.push(marker)
        }
      })
      // setStyle() wipes custom sources/layers — re-add the route after every style switch.
      map.on('style.load', () => setupRouteLayer(maplibregl))
      map.on('dragstart zoomstart', () => setFollowMode(false))
    })
    return () => {
      cancelled = true
      if (styleWatchdog.current) clearTimeout(styleWatchdog.current)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    armStyleWatchdog(mapRef.current)
    mapRef.current.setStyle(maptilerStyleUrl(styleId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId])

  useEffect(() => {
    mapRef.current?.easeTo({ pitch: is3D ? 55 : 0, duration: 400 })
  }, [is3D])

  useEffect(() => {
    if (!position || !mapRef.current) return
    import('maplibre-gl').then((mod) => {
      const maplibregl = mod.default ?? mod
      const map = mapRef.current
      if (!map) return
      const color = STATE_COLOR[state]
      const rotation = bearingDeg ?? 0

      if (userMarker.current && userMarkerArrow.current) {
        userMarker.current.setLngLat([position.lon, position.lat])
        userMarkerArrow.current.style.transform = `rotate(${rotation}deg)`
        userMarkerArrow.current.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 2 L20 20 L12 16 L4 20 Z"/></svg>`
      } else {
        const el = document.createElement('div')
        el.style.cssText = 'width:32px;height:32px;'
        const arrow = document.createElement('div')
        arrow.style.cssText = `transform:rotate(${rotation}deg);width:32px;height:32px;display:flex;align-items:center;justify-content:center;`
        arrow.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 2 L20 20 L12 16 L4 20 Z"/></svg>`
        el.appendChild(arrow)
        userMarkerArrow.current = arrow
        userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([position.lon, position.lat]).addTo(map)
      }
      if (!hasCentered.current) { map.jumpTo({ center: [position.lon, position.lat], zoom: 16 }); hasCentered.current = true }
      else if (followMode) map.easeTo({ center: [position.lon, position.lat], duration: 500 })
    })
  }, [position, bearingDeg, state, followMode])

  const handleRecenter = () => {
    setFollowMode(true)
    if (position && mapRef.current) mapRef.current.easeTo({ center: [position.lon, position.lat], duration: 400 })
  }

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <button
        onClick={handleRecenter}
        className={`absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full shadow-lg flex items-center justify-center ${followMode ? 'bg-sky-500 text-white' : 'bg-white text-slate-700'}`}
        aria-label="Centra sulla mia posizione"
      >
        <Locate className="w-5 h-5" />
      </button>
    </div>
  )
}
