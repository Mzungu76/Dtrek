'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { PoiItem } from '@/lib/overpass'
import { POI_META, buildPoiPopupHtml, poiHasLink } from '@/lib/overpass'
import type { WikiPage } from '@/lib/wikipedia'
import type { ClassifiedDifficultyMarker } from '@/lib/difficultyMarkers'
import type { TrailDtmProfile } from '@/lib/dtm/trailDtmProfile'
import { colorSegmentsByDtm, aspectDegToColor } from '@/lib/dtm/dtmColors'
import { useRouteTour, SPEEDS } from './mapview/useRouteTour'
import TourControls from './mapview/TourControls'

interface Props {
  trackPoints: TrackPoint[]
  height?: string
  showGradient?: boolean
  showAspect?: boolean
  dtmProfile?: TrailDtmProfile
  pois?: PoiItem[]
  wikiPages?: WikiPage[]
  difficultyMarkers?: ClassifiedDifficultyMarker[]
  floraMarkers?: { lat: number; lon: number; label: string }[]
  planned?: boolean
  activeIndex?: number | null
  /** When false, disables all native pan/zoom gestures (used by the fullscreen route hub's "locked" mode). Default true. */
  interactive?: boolean
  /** Index into `pois` to draw larger/highlighted and pan the map to (used by the route hub's POI section, synced to scroll position). */
  highlightedPoiIndex?: number | null
  /** Fired when a POI marker is tapped — lets the caller scroll/highlight the matching paragraph
   *  in the tourist guide (e.g. "I luoghi da non perdere"). Doesn't replace the existing
   *  zoom-in-on-click behavior, just runs alongside it. */
  onPoiTap?: (poi: PoiItem) => void
  /** Index into `difficultyMarkers` to draw larger/highlighted and pan the map to (used by the route hub's Sicurezza section). */
  highlightedDifficultyIndex?: number | null
  /** Whether the POI markers are actually mounted on the map — off by default, turned on by the
   *  "Punti di interesse" side-rail icon so the layer starts hidden and is a deliberate action. */
  showPoiLayer?: boolean
  /** Shows the play/pause/speed tour controls and enables the animated playback along the track. */
  showTourControls?: boolean
  /** Height, in px, currently covered by an overlapping bottom sheet/banner — when it changes,
   *  the map re-centers so whatever point was visually centered in the *unobscured* band stays
   *  there, instead of drifting toward the half hidden behind the sheet. 0 when nothing overlaps. */
  obscuredBottomPx?: number
}

const DTM_MATCH_RADIUS_M = 25

const SEVERITY_COLOR: Record<ClassifiedDifficultyMarker['severity'], string> = {
  danger: '#dc2626',
  warning: '#f59e0b',
  info: '#3b82f6',
}

const SEVERITY_EMOJI: Record<ClassifiedDifficultyMarker['severity'], string> = {
  danger: '⚠️',
  warning: '⚠️',
  info: 'ℹ️',
}

// Slope → color (green=easy, yellow=moderate, orange=steep, red=extreme)
function slopeColor(pct: number): string {
  const a = Math.abs(pct)
  if (a < 8)  return '#22c55e'
  if (a < 15) return '#eab308'
  if (a < 25) return '#f97316'
  return '#ef4444'
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a  = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function MapView({
  trackPoints,
  height = '400px',
  showGradient = false,
  showAspect = false,
  dtmProfile,
  pois = [],
  wikiPages = [],
  difficultyMarkers = [],
  floraMarkers = [],
  planned = false,
  activeIndex = null,
  interactive = true,
  highlightedPoiIndex = null,
  onPoiTap,
  highlightedDifficultyIndex = null,
  showPoiLayer = false,
  showTourControls = false,
  obscuredBottomPx = 0,
}: Props) {
  const mapRef          = useRef<HTMLDivElement>(null)
  const mapInstance     = useRef<any>(null)
  const obscuredBottomPxRef = useRef(obscuredBottomPx)
  obscuredBottomPxRef.current = obscuredBottomPx
  const focusLatLngRef  = useRef<any>(null)
  const poiLayer        = useRef<any[]>([])
  const poiMarkersRef   = useRef<Map<number, any>>(new Map())
  const wikiLayer       = useRef<any[]>([])
  const dtmProfileRef   = useRef(dtmProfile)
  dtmProfileRef.current = dtmProfile
  const difficultyLayer = useRef<any[]>([])
  const floraLayer      = useRef<any[]>([])
  const activeMarker    = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)

  const tour = useRouteTour({
    mapInstance, mapReady, trackPoints, pois, poiMarkersRef, enabled: showTourControls,
  })

  // Main map init effect
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const points = trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)
    if (points.length === 0) return

    // React 18 Strict Mode (dev only) invokes this effect twice in a row (mount → cleanup →
    // mount) before the async `import('leaflet')` below has a chance to resolve — without this
    // flag both invocations would race to create a map on the same container, producing two
    // independent fitBounds calls (the visible "double centering" glitch). The cleanup below
    // flips this flag so the stale invocation's callback becomes a no-op once it resolves.
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current || mapInstance.current) return
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        iconUrl: '/leaflet/marker-icon.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      })

      const coords: [number, number][] = points.map(p => [p.lat!, p.lon!])
      // No initial setView here — the map gets its one and only view from fitBounds
      // below (all branches call it). Setting an initial center first and then
      // fitBounds right after produced a visible "double centering" jump.
      const map = L.map(mapRef.current!, { zoomControl: false })
      mapInstance.current = map
      setMapReady(true)

      // Same-origin proxy (cached by the service worker + Next's server-side fetch cache)
      // instead of hitting tile.openstreetmap.org directly on every pan/zoom.
      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const dtmProfile = dtmProfileRef.current
      const baseColor = planned ? '#0ea5e9' : '#378d44'
      const dtmActive = dtmProfile?.source === 'dtm'
      const latLons = coords.map(([lat, lon]) => ({ lat, lon }))

      if (showAspect && dtmActive) {
        // Draw per-segment aspect-colored polylines (DTM-only — no GPX fallback exists for exposure)
        const aspectColors = colorSegmentsByDtm(latLons, dtmProfile!, 'aspect', DTM_MATCH_RADIUS_M)
        for (let i = 0; i < coords.length - 1; i++) {
          L.polyline([coords[i], coords[i + 1]], {
            color: aspectColors[i] ?? '#9ca3af',
            weight: 4,
            opacity: 0.9,
          }).addTo(map)
        }
        const AspectLegend = L.Control.extend({
          onAdd(): HTMLElement {
            const d = L.DomUtil.create('div', '')
            d.style.cssText = 'background:white;padding:6px 10px;border-radius:8px;font-size:11px;line-height:1.6;box-shadow:0 1px 4px rgba(0,0,0,0.2)'
            d.innerHTML = [
              '<b>Esposizione</b>',
              `<span style="color:${aspectDegToColor(0)}">■</span> N`,
              `<span style="color:${aspectDegToColor(90)}">■</span> E`,
              `<span style="color:${aspectDegToColor(180)}">■</span> S`,
              `<span style="color:${aspectDegToColor(270)}">■</span> O`,
            ].join('<br>')
            return d
          },
        })
        new AspectLegend({ position: 'bottomright' }).addTo(map)
      } else if (showGradient && points.some(p => p.altitudeMeters !== undefined)) {
        // Draw per-segment colored polylines — DTM slope where a sample is close enough,
        // GPX net-elevation-delta fallback per pair otherwise (degrades per-segment, not the whole toggle)
        const slopeColors = dtmActive ? colorSegmentsByDtm(latLons, dtmProfile!, 'slope', DTM_MATCH_RADIUS_M) : null
        for (let i = 0; i < coords.length - 1; i++) {
          let color = slopeColors?.[i] ?? null
          if (!color) {
            const p1 = points[i], p2 = points[i + 1]
            const dist = haversineM(p1.lat!, p1.lon!, p2.lat!, p2.lon!)
            const dEle = ((p2.altitudeMeters ?? p1.altitudeMeters ?? 0) - (p1.altitudeMeters ?? 0))
            const slopePct = dist > 0 ? (dEle / dist) * 100 : 0
            color = slopeColor(slopePct)
          }
          L.polyline([coords[i], coords[i + 1]], {
            color,
            weight: 4,
            opacity: 0.9,
          }).addTo(map)
        }
        // Legend: degree buckets (matching lib/trailScore.ts's slopeTerrainMult) when DTM is
        // live, otherwise the existing percent buckets used by the GPX-only fallback.
        const LegendControl = L.Control.extend({
          onAdd(): HTMLElement {
            const d = L.DomUtil.create('div', '')
            d.style.cssText = 'background:white;padding:6px 10px;border-radius:8px;font-size:11px;line-height:1.6;box-shadow:0 1px 4px rgba(0,0,0,0.2)'
            d.innerHTML = dtmActive
              ? [
                  '<b>Pendenza</b>',
                  '<span style="color:#22c55e">■</span> &lt;10°',
                  '<span style="color:#eab308">■</span> 10-20°',
                  '<span style="color:#f97316">■</span> 20-30°',
                  '<span style="color:#ef4444">■</span> 30-40°',
                  '<span style="color:#7f1d1d">■</span> &gt;40°',
                ].join('<br>')
              : [
                  '<b>Pendenza</b>',
                  '<span style="color:#22c55e">■</span> &lt;8%',
                  '<span style="color:#eab308">■</span> 8-15%',
                  '<span style="color:#f97316">■</span> 15-25%',
                  '<span style="color:#ef4444">■</span> &gt;25%',
                ].join('<br>')
            return d
          },
        })
        new LegendControl({ position: 'bottomright' }).addTo(map)
      } else {
        const polyline = L.polyline(coords, {
          color: baseColor,
          weight: 4,
          opacity: 0.85,
          smoothFactor: 1.5,
        }).addTo(map)
        map.fitBounds(polyline.getBounds(), { padding: [20, 20], animate: false })
      }

      // Always fit bounds (for gradient/aspect mode, fit after drawing segments) — never
      // animated: this is the map's first-ever view, so an animated pan/zoom here would just
      // look like a second, redundant "centering" jump right after the map appears.
      if (showGradient || showAspect) {
        map.fitBounds(L.polyline(coords).getBounds(), { padding: [20, 20], animate: false })
      }

      // Start / end markers (always shown)
      const mkIcon = (label: string, color: string) => L.divIcon({
        html: `<div style="background:${color};color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${label}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14], className: '',
      })

      L.marker(coords[0], { icon: mkIcon('S', baseColor) }).addTo(map).bindPopup('Partenza')
      L.marker(coords[coords.length - 1], { icon: mkIcon('A', '#c05a17') }).addTo(map).bindPopup('Arrivo')
    })

    return () => {
      cancelled = true
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
        setMapReady(false)
      }
    }
  }, [trackPoints, showGradient, showAspect, planned]) // eslint-disable-line react-hooks/exhaustive-deps -- dtmProfile read via ref to avoid full map reinit when it arrives async

  // Lock/unlock native gestures — toggled independently of the init effect above so
  // flipping "interactive" never remounts (and re-fits bounds on) the existing map instance.
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    const map = mapInstance.current
    const handlers = [map.dragging, map.scrollWheelZoom, map.touchZoom, map.doubleClickZoom]
    handlers.forEach(h => { if (h) interactive ? h.enable() : h.disable() })
  }, [interactive, mapReady])

  // Keeps Leaflet's internal size cache in sync when the container is resized by CSS alone (e.g.
  // toggling a "schermo intero" wrapper class) instead of a React remount — without this, tiles
  // stay clipped/offset to whatever size the map had when it was first created.
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !mapRef.current) return
    const map = mapInstance.current
    let raf = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => map.invalidateSize())
    })
    observer.observe(mapRef.current)
    return () => { cancelAnimationFrame(raf); observer.disconnect() }
  }, [mapReady])

  // Tracks whichever LatLng currently sits at the *visible* (unobscured) center — every user
  // pan/zoom (and our own corrective pans below) updates it, so "the point centered before the
  // change" always means the right thing, whether that's the route's initial center or somewhere
  // the user has since navigated to.
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    const map = mapInstance.current
    const updateFocus = () => {
      const size = map.getSize()
      const desiredY = (size.y - obscuredBottomPxRef.current) / 2
      focusLatLngRef.current = map.containerPointToLatLng([size.x / 2, desiredY])
    }
    updateFocus()
    map.on('moveend', updateFocus)
    return () => { map.off('moveend', updateFocus) }
  }, [mapReady])

  // Re-anchors the tracked focus point at the visible center whenever the obscured height
  // changes (the bottom sheet opening, or being dragged up/down) — so the map adapts live
  // instead of leaving the focus point to drift behind the sheet.
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !focusLatLngRef.current) return
    const map = mapInstance.current
    const size = map.getSize()
    const desiredY = (size.y - obscuredBottomPx) / 2
    const p = map.latLngToContainerPoint(focusLatLngRef.current)
    const offsetX = p.x - size.x / 2
    const offsetY = p.y - desiredY
    if (Math.abs(offsetX) < 0.5 && Math.abs(offsetY) < 0.5) return
    map.panBy([offsetX, offsetY], { animate: false })
  }, [obscuredBottomPx, mapReady])

  // POI layer — re-runs when pois arrive, the map finishes initializing, or the layer is
  // toggled on/off. Off by default: markers aren't mounted at all until `showPoiLayer` is true,
  // both to keep the map clean until asked for and to avoid the cost of dozens of markers.
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      // Clear previous markers
      poiLayer.current.forEach((m: any) => m.remove())
      poiLayer.current = []
      poiMarkersRef.current.clear()

      if (!showPoiLayer) return

      pois.forEach((poi, i) => {
        const meta = POI_META[poi.type]
        const isHighlighted = i === highlightedPoiIndex
        const hasLink = poiHasLink(poi)
        const size = isHighlighted ? 40 : 28
        // POIs with a Wikipedia/website link get a blue ring + badge, so they stand out on the
        // map itself (before the popup is even opened) — same blue used for Wikipedia markers.
        const ring = hasLink
          ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid #2563eb;box-shadow:0 0 0 2px rgba(37,99,235,0.25)"></div>
             <div style="position:absolute;bottom:-1px;right:-1px;width:11px;height:11px;border-radius:50%;background:#2563eb;border:1.5px solid white"></div>`
          : ''
        const icon = L.divIcon({
          html: `<div style="position:relative;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">
                   ${ring}
                   <div style="font-size:${isHighlighted ? 30 : 22}px;line-height:1;filter:drop-shadow(0 1px ${isHighlighted ? 4 : 2}px rgba(0,0,0,0.5));transition:font-size .2s">${meta.emoji}</div>
                 </div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          className: '',
        })
        const popup = buildPoiPopupHtml(poi)

        const m = L.marker([poi.lat, poi.lon], { icon, zIndexOffset: isHighlighted ? 1000 : 0 }).addTo(mapInstance.current).bindPopup(popup, { maxWidth: 250 })
        m.on('click', () => {
          mapInstance.current.setView([poi.lat, poi.lon], Math.max(mapInstance.current.getZoom(), 16), { animate: true })
          onPoiTap?.(poi)
        })
        poiLayer.current.push(m)
        poiMarkersRef.current.set(poi.id, m)
      })

      if (highlightedPoiIndex != null && pois[highlightedPoiIndex]) {
        mapInstance.current.panTo([pois[highlightedPoiIndex].lat, pois[highlightedPoiIndex].lon])
      }
    })
  }, [pois, mapReady, highlightedPoiIndex, showPoiLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  // Active point marker — driven by hover on the synced charts
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      if (activeMarker.current) { activeMarker.current.remove(); activeMarker.current = null }
      if (activeIndex == null) return

      const pt = trackPoints[activeIndex]
      if (!pt || pt.lat === undefined || pt.lon === undefined) return

      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        className: '',
      })
      activeMarker.current = L.marker([pt.lat, pt.lon], { icon, interactive: false, zIndexOffset: 1000 }).addTo(mapInstance.current)
    })
  }, [activeIndex, mapReady, trackPoints])

  // Wikipedia layer — only pages that have coordinates
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      wikiLayer.current.forEach((m: any) => m.remove())
      wikiLayer.current = []

      for (const page of wikiPages) {
        if (page.lat == null || page.lon == null) continue

        const iconHtml = page.thumbnail
          ? `<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.45);background:#3b82f6">
               <img src="${page.thumbnail}" style="width:100%;height:100%;object-fit:cover" loading="lazy">
             </div>`
          : `<div style="background:#3b82f6;color:white;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:bold;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)">W</div>`

        const icon = L.divIcon({
          html: iconHtml,
          iconSize: [46, 46],
          iconAnchor: [23, 23],
          className: '',
        })
        const thumb = page.thumbnail
          ? `<img src="${page.thumbnail}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;float:right;margin-left:8px">`
          : ''
        const popup = `
          <div style="max-width:220px;font-size:12px;line-height:1.4">
            ${thumb}
            <b style="font-size:13px">${page.title}</b>
            ${page.description ? `<div style="color:#6b7280;margin:2px 0">${page.description}</div>` : ''}
            <div style="color:#374151;margin-top:4px">${page.extract.slice(0, 120)}…</div>
            <a href="${page.url}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:600;margin-top:6px;display:inline-block">Leggi su Wikipedia →</a>
          </div>`

        const m = L.marker([page.lat, page.lon], { icon })
          .addTo(mapInstance.current)
          .bindPopup(popup, { maxWidth: 240 })
        wikiLayer.current.push(m)
      }
    })
  }, [wikiPages, mapReady])

  // Difficulty-marker layer — tratti difficili dal GPX importato (Komoot/
  // AllTrails waypoint & track comments classificati da lib/difficultyMarkers.ts)
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      difficultyLayer.current.forEach((m: any) => m.remove())
      difficultyLayer.current = []

      difficultyMarkers.forEach((marker, i) => {
        const color = SEVERITY_COLOR[marker.severity]
        const isHighlighted = i === highlightedDifficultyIndex
        const size = isHighlighted ? 38 : 26
        const icon = L.divIcon({
          html: `<div style="background:${color};color:white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${isHighlighted ? 18 : 13}px;border:2px solid white;box-shadow:0 2px ${isHighlighted ? 8 : 6}px rgba(0,0,0,0.4);transition:width .2s,height .2s">${SEVERITY_EMOJI[marker.severity]}</div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '',
        })
        const popup = `
          <div style="max-width:220px;font-size:12px;line-height:1.4">
            <b style="color:${color}">${marker.severity === 'danger' ? 'Pericolo' : marker.severity === 'warning' ? 'Attenzione' : 'Info'}</b>
            <div style="color:#374151;margin-top:4px">${marker.text}</div>
          </div>`

        const m = L.marker([marker.lat, marker.lon], { icon, zIndexOffset: isHighlighted ? 1000 : 0 })
          .addTo(mapInstance.current)
          .bindPopup(popup, { maxWidth: 240 })
        difficultyLayer.current.push(m)
      })

      if (highlightedDifficultyIndex != null && difficultyMarkers[highlightedDifficultyIndex]) {
        mapInstance.current.panTo([difficultyMarkers[highlightedDifficultyIndex].lat, difficultyMarkers[highlightedDifficultyIndex].lon])
      }
    })
  }, [difficultyMarkers, mapReady, highlightedDifficultyIndex])

  // Flora-marker layer — GBIF observation positions (Galleria Verde map)
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return

    import('leaflet').then(L => {
      floraLayer.current.forEach((m: any) => m.remove())
      floraLayer.current = []

      for (const marker of floraMarkers) {
        const icon = L.divIcon({
          html: `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))">🌿</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          className: '',
        })
        const m = L.marker([marker.lat, marker.lon], { icon })
          .addTo(mapInstance.current)
          .bindPopup(`<div style="font-size:12px">${marker.label}</div>`)
        floraLayer.current.push(m)
      }
    })
  }, [floraMarkers, mapReady])

  const hasGps = trackPoints.some(p => p.lat !== undefined)

  if (!hasGps) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400 text-sm"
        style={{ height }}
      >
        Nessun dato GPS disponibile in questo file
      </div>
    )
  }

  return (
    <div className="relative" style={{ height }}>
      <div
        ref={mapRef}
        style={{ height: '100%' }}
        className="rounded-xl overflow-hidden border border-stone-200 shadow-sm"
      />
      {showTourControls && tour.hasTrack && (
        <TourControls
          isPlaying={tour.isPlaying}
          progress={tour.progress}
          speedIdx={tour.speedIdx}
          speeds={SPEEDS}
          onPlay={tour.play}
          onPause={tour.pause}
          onReset={tour.reset}
          onSpeedChange={tour.setSpeedIdx}
        />
      )}
    </div>
  )
}
