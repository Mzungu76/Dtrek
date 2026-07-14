import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'
import type { PoiItem } from '@/lib/overpass'

export const SPEEDS = [
  { label: '0.5×', v: 0.5 },
  { label: '1×',   v: 1 },
  { label: '2×',   v: 2 },
  { label: '4×',   v: 4 },
]

const PROXIMITY_M = 40
const POPUP_MS     = 1500

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180
  const dl = (lon2 - lon1) * Math.PI / 180
  const a  = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface Args {
  mapInstance: React.MutableRefObject<L.Map | null>
  mapReady: boolean
  trackPoints: TrackPoint[]
  pois: PoiItem[]
  /** POI id → Leaflet marker, kept in sync by MapView's POI layer effect. */
  poiMarkersRef: React.MutableRefObject<Map<number, L.Marker>>
  enabled: boolean
}

/**
 * Animated "tour" playback along a track on the 2D Leaflet map — play/pause, speed control, a
 * marker that advances along the route with the map panning to follow it, and automatic POI
 * popups when the marker comes within range. Adapted from the equivalent 3D/MapLibre logic in
 * RouteMap3D.tsx (no pitch/bearing/camera here, just pan + marker; no video export).
 */
export function useRouteTour({ mapInstance, mapReady, trackPoints, pois, poiMarkersRef, enabled }: Args) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [speedIdx,  setSpeedIdx]  = useState(1)

  const isPlayingRef      = useRef(false)
  const progressRef       = useRef(0)
  const lastTsRef         = useRef(0)
  const animRef           = useRef<number>()
  const tourMarkerRef     = useRef<L.Marker | null>(null)
  const poiTriggeredRef   = useRef<Set<number>>(new Set())
  const poiOpenIdRef      = useRef<number | null>(null)
  const poiOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pts = trackPoints.filter(p => p.lat !== undefined && p.lon !== undefined)

  // Mount/unmount the tour marker alongside the "enabled" flag — kept separate from the chart's
  // "sei qui" activeMarker so hovering a chart and playing the tour never fight over one dot.
  useEffect(() => {
    if (!enabled || !mapReady || !mapInstance.current || pts.length < 2) return
    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled) return
      const icon = L.divIcon({
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#f59e0b;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9], className: '',
      })
      tourMarkerRef.current = L.marker([pts[0].lat!, pts[0].lon!], { icon, interactive: false, zIndexOffset: 2000 }).addTo(mapInstance.current!)
    })
    return () => {
      cancelled = true
      tourMarkerRef.current?.remove()
      tourMarkerRef.current = null
    }
  }, [enabled, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isPlayingRef.current = isPlaying
    if (!isPlaying) { if (animRef.current) cancelAnimationFrame(animRef.current); return }
    if (pts.length < 2) return

    lastTsRef.current = 0
    const N = pts.length

    const tick = (ts: number) => {
      if (!isPlayingRef.current) return
      const dt = lastTsRef.current ? ts - lastTsRef.current : 16
      lastTsRef.current = ts
      progressRef.current = Math.min(1, progressRef.current + (dt * SPEEDS[speedIdx].v) / 90000)
      setProgress(progressRef.current)

      const rawIdx = progressRef.current * (N - 1)
      const i0 = Math.floor(rawIdx), i1 = Math.min(i0 + 1, N - 1), frac = rawIdx - i0
      const lat = pts[i0].lat! + (pts[i1].lat! - pts[i0].lat!) * frac
      const lon = pts[i0].lon! + (pts[i1].lon! - pts[i0].lon!) * frac

      tourMarkerRef.current?.setLatLng([lat, lon])
      mapInstance.current?.panTo([lat, lon], { animate: true, duration: 0.18 })

      if (pois?.length) {
        for (const poi of pois) {
          const d = haversineM(lat, lon, poi.lat, poi.lon)
          if (d <= PROXIMITY_M) {
            if (!poiTriggeredRef.current.has(poi.id)) {
              poiTriggeredRef.current.add(poi.id)
              if (poiOpenIdRef.current !== null && poiOpenIdRef.current !== poi.id) {
                poiMarkersRef.current.get(poiOpenIdRef.current)?.closePopup()
              }
              if (poiOpenTimeoutRef.current) clearTimeout(poiOpenTimeoutRef.current)
              const marker = poiMarkersRef.current.get(poi.id)
              if (marker) {
                marker.openPopup()
                poiOpenIdRef.current = poi.id
                poiOpenTimeoutRef.current = setTimeout(() => {
                  marker.closePopup(); poiOpenIdRef.current = null; poiOpenTimeoutRef.current = null
                }, POPUP_MS)
              }
            }
          } else {
            poiTriggeredRef.current.delete(poi.id)
          }
        }
      }

      if (progressRef.current < 1) animRef.current = requestAnimationFrame(tick)
      else setIsPlaying(false)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      if (poiOpenTimeoutRef.current) { clearTimeout(poiOpenTimeoutRef.current); poiOpenTimeoutRef.current = null }
    }
  }, [isPlaying, speedIdx, pois]) // eslint-disable-line react-hooks/exhaustive-deps

  const play  = () => { if (pts.length >= 2) setIsPlaying(true) }
  const pause = () => setIsPlaying(false)
  const reset = () => {
    setIsPlaying(false)
    progressRef.current = 0
    setProgress(0)
    poiTriggeredRef.current.clear()
    if (poiOpenTimeoutRef.current) { clearTimeout(poiOpenTimeoutRef.current); poiOpenTimeoutRef.current = null }
    if (poiOpenIdRef.current != null) { poiMarkersRef.current.get(poiOpenIdRef.current)?.closePopup(); poiOpenIdRef.current = null }
    if (pts.length) tourMarkerRef.current?.setLatLng([pts[0].lat!, pts[0].lon!])
  }

  return { isPlaying, progress, speedIdx, setSpeedIdx, play, pause, reset, hasTrack: pts.length >= 2 }
}
