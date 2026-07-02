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
  /** Called if the MapTiler style hasn't finished loading within a few seconds, or errors out (missing/invalid key, no connectivity, domain-restricted key...) — the caller should fall back to the offline-safe map. `reason` is a short diagnostic string, always logged to the console regardless of environment so this is debuggable in production. */
  onStyleFailed?: (reason: string) => void
}

const STYLE_LOAD_TIMEOUT_MS = 6000

const STATE_COLOR: Record<NavState, string> = {
  idle: '#64748b',
  navigating: '#277134',
  poi_near: '#d97220',
  off_route: '#f59e0b',
  gps_lost: '#ef4444',
  finished: '#22c55e',
}

const ROUTE_SOURCE_ID = 'nav-route'
const ROUTE_LAYER_ID = 'nav-route-line'
const TERRAIN_SOURCE_ID = 'nav-terrain'
const TERRAIN_EXAGGERATION = 1.4 // matches RouteMap3D's flythrough for a consistent look

// At a steep pitch, the same zoom level shows much less ground in the
// foreground than a flat view (perspective foreshortening), and combined
// with terrain exaggeration the near-camera tiles get oversampled/blocky —
// exactly the reported "sgranatura". A pitched view needs a noticeably
// lower zoom to show a comparable amount of terrain at a readable
// resolution. These are used both for the initial center and for the
// live-follow re-center, so switching 3D on/off doesn't leave the map stuck
// at the wrong zoom for its current pitch.
function initialZoomFor(is3D: boolean): number { return is3D ? 13 : 15 }
function followZoomFor(is3D: boolean): number { return is3D ? 14.5 : 16 }

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
  const errorListener = useRef<((e: any) => void) | null>(null)
  const resizeObserver = useRef<ResizeObserver | null>(null)
  // Event listeners registered once at mount close over stale props — this
  // ref lets setupTerrain() (called from 'load'/'style.load') always read
  // the current is3D value instead of whatever it was when first attached.
  const is3DRef = useRef(is3D)
  is3DRef.current = is3D
  const [followMode, setFollowMode] = useState(true)

  const reportFailure = (reason: string) => {
    // Always logged (not gated by NODE_ENV) — this is the one place that can
    // tell the difference between "no key", "key rejected" (invalid/expired/
    // domain-restricted in the MapTiler dashboard) and "no network", none of
    // which are distinguishable from the silent fallback alone.
    console.error(`[NavigationMapLibre] Online map style failed to load: ${reason}`)
    onStyleFailed?.(reason)
  }

  /**
   * Arms a timeout that reports style-load failure unless 'load'/'style.load'
   * fires first — MapTiler gives no explicit signal for "key missing/
   * invalid", it just never finishes loading. The 'error' listener is
   * deliberately torn down the moment the style finishes loading, not left
   * attached for the map's whole lifetime: MapLibre fires 'error' for
   * ordinary recoverable hiccups too (a DEM tile missing at the edge of
   * terrain coverage, a transient fetch failure on one of many tiles), and
   * treating any later one of those as "the whole style failed" was
   * observed — via a HAR capture — to abort in-flight requests and fall
   * back to the offline map over what should have been a shrug-and-continue.
   */
  const armStyleWatchdog = (map: any, styleUrl: string) => {
    if (styleWatchdog.current) clearTimeout(styleWatchdog.current)
    if (errorListener.current) { map.off('error', errorListener.current); errorListener.current = null }

    styleWatchdog.current = setTimeout(() => {
      // Diagnostic fetch, best-effort: pinpoints 401/403 (invalid or domain-restricted key) vs. a network failure.
      fetch(styleUrl).then((res) => {
        reportFailure(res.ok ? `timeout after ${STYLE_LOAD_TIMEOUT_MS}ms despite style.json responding ${res.status} — check network/CSP` : `style.json responded ${res.status} ${res.statusText} — check the MapTiler key and its domain allowlist`)
      }).catch((err) => reportFailure(`timeout after ${STYLE_LOAD_TIMEOUT_MS}ms, style.json fetch also failed: ${err}`))
    }, STYLE_LOAD_TIMEOUT_MS)

    const stopWatching = () => {
      if (styleWatchdog.current) { clearTimeout(styleWatchdog.current); styleWatchdog.current = null }
      if (errorListener.current) { map.off('error', errorListener.current); errorListener.current = null }
    }
    errorListener.current = (e: any) => { stopWatching(); reportFailure(e?.error?.message ?? String(e)) }
    map.once('load', stopWatching)
    map.once('style.load', stopWatching)
    map.on('error', errorListener.current)
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
      map.addLayer({ id: ROUTE_LAYER_ID, type: 'line', source: ROUTE_SOURCE_ID, paint: { 'line-color': '#277134', 'line-width': 4, 'line-opacity': 0.85 } })
    }
  }

  // "3D" was just a pitch on a flat map — real relief needs an elevation
  // source too. Same terrain-rgb-v2 dataset and setTerrain() call as
  // RouteMap3D's flythrough. Independent of whichever base style is active
  // (Outdoor/Satellite/Winter each have their own sources, but none of that
  // matters here — this is our own additional source), and re-added after
  // every style.load since setStyle() wipes custom sources/layers.
  // Terrain is an enhancement on top of an already-working map — a failure
  // here (DEM source rejected, WebGL/GPU can't handle hillshading, a style-
  // specific quirk...) must never cascade into abandoning the whole online
  // map and falling back to offline; that fallback is reserved for the style
  // itself failing to load (armStyleWatchdog/reportFailure above). Observed
  // in a HAR capture: enabling 3D aborted in-flight tile requests and
  // triggered the offline fallback — this try/catch, plus keeping this
  // failure entirely out of reportFailure(), is the fix.
  const setupTerrain = (map: any) => {
    try {
      if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
          tileSize: 512,
        })
      }
      map.setTerrain(is3DRef.current ? { source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION } : null)
      if (is3DRef.current && !map.getLayer('nav-sky')) {
        map.addLayer({ id: 'nav-sky', type: 'sky', paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun-intensity': 15 } })
      }
    } catch (err) {
      console.error('[NavigationMapLibre] 3D terrain/sky setup failed, continuing with a flat map:', err)
    }
  }

  useEffect(() => {
    if (!MAPTILER_KEY) {
      console.error('[NavigationMapLibre] NEXT_PUBLIC_MAPTILER_KEY is empty at runtime — the online map styles will fail to load and fall back to offline. If this is a Vercel Preview/branch deployment, check that the env var is enabled for that environment, not just Production.')
    }
    let cancelled = false
    import('maplibre-gl').then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const maplibregl = mod.default ?? mod
      const start: [number, number] = routePolyline[0] ? [routePolyline[0][1], routePolyline[0][0]] : [12.5, 41.9]
      const styleUrl = maptilerStyleUrl(styleId)
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: start, zoom: initialZoomFor(is3D), pitch: is3D ? 55 : 0, bearing: 0,
      })
      mapRef.current = map
      armStyleWatchdog(map, styleUrl)

      // Unlike Leaflet, MapLibre GL sizes its WebGL canvas from the
      // container's bounding rect at construction time and never revisits
      // it on its own. If the container was still zero-sized at that exact
      // moment (a real, observed failure mode: the network tab shows every
      // tile/style/font request succeeding with 200 yet nothing paints), the
      // map stays permanently invisible until something calls resize(). A
      // ResizeObserver — not a one-shot timeout — keeps it correct across
      // later layout changes too (orientation change, sheet expanding...).
      resizeObserver.current = new ResizeObserver(() => map.resize())
      resizeObserver.current.observe(containerRef.current!)
      setTimeout(() => map.resize(), 0)

      map.on('load', () => {
        setupRouteLayer(maplibregl)
        setupTerrain(map)
        for (const poi of pois) {
          const marker = new maplibregl.Marker().setLngLat([poi.lon, poi.lat]).addTo(map)
          markersRef.current.push(marker)
        }
      })
      // setStyle() wipes custom sources/layers — re-add the route and terrain after every style switch.
      map.on('style.load', () => { setupRouteLayer(maplibregl); setupTerrain(map) })
      // MapLibre GL, unlike Leaflet, does NOT support space-separated event
      // names in on() — `map.on('dragstart zoomstart', ...)` silently
      // registers a listener for a nonexistent event and never fires, so
      // followMode never turned false on a manual pan/zoom. Every next GPS
      // fix (a few seconds later) then called easeTo() back to the live
      // position, making the map feel impossible to move — exactly the
      // reported symptom. Two separate listeners, the way MapLibre expects.
      // 'zoomstart' (unlike 'dragstart') also fires for OUR OWN programmatic
      // jumpTo/easeTo zoom changes (the initial auto-center below); guard on
      // originalEvent, only set on genuine user mouse/touch/wheel input, so
      // our own camera moves don't self-disable follow mode immediately.
      map.on('dragstart', () => setFollowMode(false))
      map.on('zoomstart', (e: any) => { if (e.originalEvent) setFollowMode(false) })
    })
    return () => {
      cancelled = true
      if (styleWatchdog.current) clearTimeout(styleWatchdog.current)
      resizeObserver.current?.disconnect()
      resizeObserver.current = null
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    const styleUrl = maptilerStyleUrl(styleId)
    armStyleWatchdog(mapRef.current, styleUrl)
    mapRef.current.setStyle(styleUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Re-zoom together with the pitch change, not just at the initial
    // center: switching 3D on/off mid-hike should also fix the "too close/
    // blocky at this pitch" mismatch immediately, not only the next time
    // the map re-centers on the hiker.
    const zoom = followMode ? followZoomFor(is3D) : undefined
    map.easeTo({ pitch: is3D ? 55 : 0, ...(zoom != null ? { zoom } : {}), duration: 400 })
    // Style may still be mid-load right after a style switch — setTerrain()
    // throws if called before the style is ready, so defer to 'idle' in that case.
    if (map.isStyleLoaded()) setupTerrain(map)
    else map.once('idle', () => setupTerrain(map))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!hasCentered.current) { map.jumpTo({ center: [position.lon, position.lat], zoom: followZoomFor(is3DRef.current) }); hasCentered.current = true }
      else if (followMode) map.easeTo({ center: [position.lon, position.lat], duration: 500 })
    })
  }, [position, bearingDeg, state, followMode])

  const handleRecenter = () => {
    setFollowMode(true)
    if (position && mapRef.current) mapRef.current.easeTo({ center: [position.lon, position.lat], duration: 400 })
  }

  return (
    <div className="absolute inset-0">
      {/*
        Inline style, not just the "absolute inset-0" utility classes:
        MapLibre's constructor adds its own "maplibregl-map" class to this
        exact element, and maplibre-gl.css sets `.maplibregl-map { position:
        relative }` on it. If that stylesheet rule ends up later than
        Tailwind's `.absolute` in the final bundle (order depends on
        webpack's CSS chunking, not something we control), position flips
        to relative, `inset-0` becomes a no-op (it only affects absolutely
        positioned elements), and this div collapses to its content size —
        near-zero height, since it starts empty. The map object then reports
        every tile/style/font request succeeding (nothing wrong at the
        network or JS level) while the canvas stays invisible. An inline
        style always wins over any stylesheet rule without !important, so
        it can't be silently overridden this way.
      */}
      <div ref={containerRef} className="absolute inset-0" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
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
