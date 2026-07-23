'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

interface Props {
  lat?: number
  lon?: number
  onPick: (lat: number, lon: number) => void
  height?: string
  // Angoli arrotondati di default (card interna) — disattivato per un uso a pieno schermo
  // (es. componenti/upload/RouteBuilder.tsx, step "Partenza"), dove il bordo deve arrivare a
  // filo schermo.
  rounded?: boolean
}

const DEFAULT_CENTER: [number, number] = [42.5, 12.5] // centro Italia
const DEFAULT_ZOOM = 5

/** Click-to-pick map: shows a draggable marker, calls onPick(lat, lon) on click/drag. */
export default function LocationPickerMap({ lat, lon, onPick, height = '260px', rounded = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<unknown>(null)
  const markerRef      = useRef<unknown>(null)
  const onPickRef      = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) {
      (mapRef.current as { remove(): void }).remove()
      mapRef.current = null
    }

    let cancelled = false

    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      const start: [number, number] = lat != null && lon != null ? [lat, lon] : DEFAULT_CENTER
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
        .setView(start, lat != null && lon != null ? 14 : DEFAULT_ZOOM)
      mapRef.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        maxZoom: 18,
        attribution: '© OpenStreetMap',
      }).addTo(map)
      L.control.attribution({ prefix: false }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#2d7a3d;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);transform:rotate(-45deg)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 18],
      })

      const marker = L.marker(start, { icon, draggable: true }).addTo(map)
      markerRef.current = marker

      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onPickRef.current(p.lat, p.lng)
      })

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng)
        onPickRef.current(e.latlng.lat, e.latlng.lng)
      })
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className={`w-full overflow-hidden bg-stone-100 cursor-crosshair ${rounded ? 'rounded-xl' : ''}`}
    />
  )
}
