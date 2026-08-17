'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { Locate } from 'lucide-react'
import type { NavState } from '@/lib/navigation/types'
import { computeDirectionArrows } from '@/lib/geoUtils'
import { labelNearbyTrail, formatTrailDistance } from '@/lib/navigation/nearbyTrailLabels'
import { poiBadgeMarkup } from '@/components/poiIcons'
import { POI_META, type PoiType } from '@/lib/overpass'
import { shortestRotation } from '@/lib/navigation/orientation'
import { SLOPE_GRADE_COLOR, type SlopeSegment } from '@/lib/navigation/routeSlopeSegments'

interface Props {
  routePolyline: [number, number][]
  pois: { id: string | number; lat: number; lon: number; name?: string; type?: string }[]
  position: { lat: number; lon: number } | null
  bearingDeg: number | null
  state: NavState
  /** Nearby hiking paths/tracks (from OSM), drawn as thin context lines — the offline basemap alone has no sense of "what other paths pass near here", which matters for orientation on foot. */
  nearbyTrails?: [number, number][][]
  /** Current GPS fix accuracy in meters, drawn as a translucent circle around the position marker so the hiker can tell a trustworthy fix (few meters) from a noisy one (tens of meters, e.g. under tree cover). */
  accuracyM?: number | null
  /** Dove l'escursionista ha lasciato l'auto (vedi components/navigation/ParkingSpotControl.tsx) —
   *  un pin fisso, distinto da quelli dei POI, così a fine giro è visibile sulla mappa e non solo
   *  come distanza in un pannellino. Null ⇒ nessun pin. */
  parkingSpot?: { lat: number; lon: number } | null
  /** Called when a POI marker is tapped directly on the map — the caller decides how to show info (ActiveNavigationView.tsx reuses the same callout sheet the proximity-triggered enteredPoi event already opens, so tapping and walking up to a POI show the same info in the same place). */
  onPoiTap?: (poiId: string | number) => void
  /** Layer toggles (NavLayerRail) — default true/true/false when omitted, matching the always-on
   *  behavior before these toggles existed. */
  showRoute?: boolean
  showPois?: boolean
  /** Gradient-colored route stretches (lib/navigation/routeSlopeSegments.ts) — when present and
   *  showRoute is on, replaces the flat green line with these; direction arrows are skipped in
   *  this mode (redundant clutter on top of the colored stretches). Null/omitted falls back to
   *  the plain single-color line. */
  slopeSegments?: SlopeSegment[] | null
}

const FOLLOW_ZOOM = 17
const DIRECTION_ARROW_SPACING_M = 400
const DIRECTION_ARROW_ICON_PX = 11
const DIRECTION_ARROW_SVG_PX = 9

const STATE_COLOR: Record<NavState, string> = {
  idle: '#64748b',
  navigating: '#277134',
  poi_near: '#d97220',
  uncertain: '#94a3b8',
  off_route: '#f59e0b',
  wrong_direction: '#c2410c',
  gps_lost: '#ef4444',
  finished: '#22c55e',
}

// Always the 'voyager' raster style from /api/tile (CartoDB/OSM proxy) —
// this is the offline-safe map (see the offline-tile licensing note in the
// plan), so it deliberately doesn't offer the satellite/3D styles that live
// in NavigationMapLibre; those require network/MapTiler and aren't part of
// the downloaded offline package.
const TILE_URL = '/api/tile?z={z}&x={x}&y={y}&style=voyager'

// Warm brown, distinct from the planned route's green and the off-route amber/orange markers —
// a CalTopo-style "here's what else is nearby" reference, not a warning or the route itself.
const NEARBY_TRAIL_COLOR = '#92552a'
// Skip labeling fragments this short — Overpass returns every way in the bbox, including short
// connector stubs a distance label would only clutter, not help with.
const NEARBY_TRAIL_MIN_LABEL_LENGTH_M = 60

/**
 * Leaflet-based full-screen navigation map with a live rotating arrow for
 * position/bearing. Auto-follows the hiker by default (Komoot-style); if the
 * hiker manually pans/zooms the map, follow mode turns off so their gesture
 * isn't fought, and a "recenter" button brings it back.
 */
export default function NavigationMap({
  routePolyline, pois, position, bearingDeg, state, nearbyTrails, accuracyM, parkingSpot, onPoiTap,
  showRoute = true, showPois = true, slopeSegments = null,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const userMarker = useRef<L.Marker | null>(null)
  const parkingMarker = useRef<L.Marker | null>(null)
  const accuracyCircle = useRef<L.Circle | null>(null)
  const nearbyTrailLayers = useRef<L.Layer[]>([])
  // Percorso e POI (NavLayerRail) — layer group/markers ricreati dai due effetti dedicati sotto,
  // separati dall'effetto di montaggio così accendere/spegnere un layer non richiede
  // ricreare l'intera mappa.
  const routeLayerGroup = useRef<L.LayerGroup | null>(null)
  const poiMarkers = useRef<L.Marker[]>([])
  const hasCentered = useRef(false)
  // Continuous rotation state for the arrow — see NavigationMapLibre.tsx / shortestRotation()'s doc
  // comment for why a raw bearingDeg can't be fed straight into rotate() when animating.
  const arrowRotation = useRef(0)
  const lastArrowColor = useRef<string | null>(null)
  const [followMode, setFollowMode] = useState(true)
  // La mappa nasce dentro un import() dinamico: gli effetti che ci disegnano sopra devono poter
  // ripartire quando è pronta, non solo quando cambiano i loro dati.
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false }).setView(
        routePolyline[0] ? [routePolyline[0][0], routePolyline[0][1]] : [41.9, 12.5],
        16,
      )
      L.tileLayer(TILE_URL, { maxZoom: 18 }).addTo(map)

      // A manual pan/zoom means the hiker wants to look around — stop fighting them with auto-recenter.
      map.on('dragstart zoomstart', () => setFollowMode(false))

      mapInstance.current = map
      setMapReady(true)
      // The container may still have been zero-sized while CSS was loading — force a relayout once mounted.
      setTimeout(() => map.invalidateSize(), 0)
    })
    return () => {
      cancelled = true
      mapInstance.current?.remove()
      mapInstance.current = null
      parkingMarker.current = null
      routeLayerGroup.current = null
      poiMarkers.current = []
      setMapReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Percorso layer (NavLayerRail) — proprio effetto, non parte del montaggio, così accendere/
  // spegnere il layer o passare alle Pendenze non richiede ricreare la mappa. In modalità Pendenze
  // le frecce di direzione sono omesse: sui segmenti già colorati per difficoltà sarebbero solo
  // rumore in più, non un'informazione aggiuntiva.
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    const map = mapInstance.current
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled) return
      routeLayerGroup.current?.remove()
      routeLayerGroup.current = null
      if (!showRoute || routePolyline.length < 2) return

      const group = L.layerGroup()
      if (slopeSegments && slopeSegments.length > 0) {
        for (const seg of slopeSegments) {
          L.polyline(seg.path, { color: SLOPE_GRADE_COLOR[seg.grade], weight: 4, opacity: 0.85 }).addTo(group)
        }
      } else {
        L.polyline(routePolyline, { color: '#277134', weight: 4, opacity: 0.8 }).addTo(group)
        // Frecce di direzione lungo il percorso da seguire (stile Komoot) — distinte dalla
        // freccia dell'escursionista sotto, che indica invece dove sta guardando/andando ORA.
        for (const arrow of computeDirectionArrows(routePolyline, DIRECTION_ARROW_SPACING_M)) {
          const px = DIRECTION_ARROW_ICON_PX
          const arrowIcon = L.divIcon({
            className: '',
            html: `<div style="transform:rotate(${arrow.bearing}deg);width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center">
                     <svg width="${DIRECTION_ARROW_SVG_PX}" height="${DIRECTION_ARROW_SVG_PX}" viewBox="0 0 24 24" fill="#277134" stroke="white" stroke-width="2.5"><path d="M12 2 L20 20 L12 15 L4 20 Z"/></svg>
                   </div>`,
            iconSize: [px, px], iconAnchor: [px / 2, px / 2],
          })
          L.marker([arrow.lat, arrow.lon], { icon: arrowIcon, interactive: false, keyboard: false }).addTo(group)
        }
      }
      group.addTo(map)
      routeLayerGroup.current = group
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showRoute, slopeSegments])

  // POI layer (NavLayerRail) — stesso motivo del Percorso qui sopra: effetto dedicato così il
  // toggle non tocca il resto della mappa.
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    const map = mapInstance.current
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled) return
      poiMarkers.current.forEach((m) => m.remove())
      poiMarkers.current = []
      if (!showPois) return

      // Leaflet's built-in default marker icon resolves its image path relative to leaflet.css's
      // own URL, which breaks when the CSS is injected via a plain <link> (see above) instead of
      // bundled — every L.marker() without an explicit icon 404s on marker-icon.png. A small
      // divIcon sidesteps that entirely instead of patching L.Icon.Default's path.
      // Same per-type icon/color (poiBadgeMarkup + POI_META) as the route-detail page's map
      // (components/MapView.tsx).
      const defaultPoiColor = '#d97220'
      for (const poi of pois) {
        const meta = poi.type ? POI_META[poi.type as PoiType] : undefined
        const icon = L.divIcon({
          className: '',
          html: poiBadgeMarkup((poi.type as PoiType) ?? 'peak', meta?.color ?? defaultPoiColor, 26),
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        })
        const marker = L.marker([poi.lat, poi.lon], { title: poi.name, icon }).addTo(map)
        if (onPoiTap) marker.on('click', () => onPoiTap(poi.id))
        poiMarkers.current.push(marker)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, showPois])

  // Context layer, drawn under the main route: other nearby paths (CalTopo-style, with a distance
  // label per segment) give a hiker something to orient by — a fork, a shortcut, a possible escape
  // route — instead of just a blank basemap with one highlighted line on it. A dedicated effect,
  // not part of the mount effect above: nearbyTrails arrives asynchronously from useNearbyTrails'
  // Overpass fetch, well after the map first mounts, so drawing it only at mount time (closing over
  // whatever the prop happened to be then — always empty) silently never showed anything.
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    const map = mapInstance.current
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled) return
      nearbyTrailLayers.current.forEach((layer) => layer.remove())
      nearbyTrailLayers.current = []
      for (const line of nearbyTrails ?? []) {
        if (line.length < 2) continue
        const polyline = L.polyline(line, { color: NEARBY_TRAIL_COLOR, weight: 2.5, opacity: 0.8, dashArray: '6 6' }).addTo(map)
        nearbyTrailLayers.current.push(polyline)

        const { lengthM, midLat, midLon } = labelNearbyTrail(line)
        if (lengthM >= NEARBY_TRAIL_MIN_LABEL_LENGTH_M) {
          const labelIcon = L.divIcon({
            className: '',
            html: `<span style="font-size:11px;font-weight:700;color:${NEARBY_TRAIL_COLOR};text-shadow:0 0 3px white,0 0 3px white,0 0 3px white;white-space:nowrap">${formatTrailDistance(lengthM)}</span>`,
            iconSize: [0, 0],
          })
          const label = L.marker([midLat, midLon], { icon: labelIcon, interactive: false, keyboard: false }).addTo(map)
          nearbyTrailLayers.current.push(label)
        }
      }
    })
    return () => { cancelled = true }
  }, [nearbyTrails, mapReady])

  useEffect(() => {
    if (!position || !mapInstance.current) return
    import('leaflet').then((L) => {
      const map = mapInstance.current
      if (!map) return
      const color = STATE_COLOR[state]
      arrowRotation.current = shortestRotation(arrowRotation.current, bearingDeg ?? 0)
      const rotation = arrowRotation.current
      const buildIcon = () => L.divIcon({
        className: '',
        html: `<div class="nav-arrow-rotator" style="transform:rotate(${rotation}deg);transition:transform 150ms linear;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M12 2 L20 20 L12 16 L4 20 Z"/></svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      })
      if (userMarker.current) {
        userMarker.current.setLatLng([position.lat, position.lon])
        // Leaflet's setIcon() replaces the whole icon DOM node, so a CSS transition on it never has
        // an "old" element to animate from — mutating the existing rotator div in place instead is
        // what actually makes the rotation glide (setIcon() is still used, but only when the state
        // color changes, since that needs new SVG markup anyway).
        const rotator = userMarker.current.getElement()?.querySelector<HTMLElement>('.nav-arrow-rotator')
        if (rotator && lastArrowColor.current === color) {
          rotator.style.transform = `rotate(${rotation}deg)`
        } else {
          userMarker.current.setIcon(buildIcon())
          lastArrowColor.current = color
        }
      } else {
        userMarker.current = L.marker([position.lat, position.lon], { icon: buildIcon(), zIndexOffset: 1000 }).addTo(map)
        lastArrowColor.current = color
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

  // Pin dell'auto — effetto a sé, così compare/si sposta/sparisce nel momento in cui l'escursionista
  // tocca il controllo, senza aspettare il prossimo fix GPS.
  useEffect(() => {
    if (!mapReady) return
    if (!parkingSpot) {
      parkingMarker.current?.remove()
      parkingMarker.current = null
      return
    }
    let cancelled = false
    import('leaflet').then((L) => {
      if (cancelled || !mapInstance.current) return
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:50%;background:#292524;border:2px solid white;box-shadow:0 1px 5px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2l-1.6-5.6A2 2 0 0 0 17.5 10H6.5a2 2 0 0 0-1.9 1.4L3 17h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/></svg>
               </div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      })
      if (parkingMarker.current) {
        parkingMarker.current.setLatLng([parkingSpot.lat, parkingSpot.lon])
        parkingMarker.current.setIcon(icon)
      } else {
        parkingMarker.current = L.marker([parkingSpot.lat, parkingSpot.lon], { icon, title: 'La mia auto', zIndexOffset: 900 })
          .addTo(mapInstance.current)
      }
    })
    return () => { cancelled = true }
  }, [mapReady, parkingSpot])

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
