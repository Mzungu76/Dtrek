'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
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
  // Raggio di ricerca (km) da disegnare come cerchio attorno al punto — assente, nessun cerchio
  // (uso invariato per i chiamanti senza un filtro di raggio, es. SectionIndirizzo.tsx).
  radiusKm?: number
}

const DEFAULT_CENTER: [number, number] = [42.5, 12.5] // centro Italia
const DEFAULT_ZOOM = 5
const CIRCLE_STYLE = { color: '#2d7a3d', weight: 1.5, fillColor: '#2d7a3d', fillOpacity: 0.08 }

/** Click-to-pick map: shows a draggable marker, calls onPick(lat, lon) on click/drag. Se
 *  radiusKm è passato, disegna anche un cerchio del raggio di ricerca attorno al punto. */
export default function LocationPickerMap({ lat, lon, onPick, height = '260px', rounded = true, radiusKm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<L.Map | null>(null)
  const markerRef  = useRef<L.Marker | null>(null)
  const circleRef  = useRef<L.Circle | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const onPickRef  = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    let cancelled = false

    ;(async () => {
      const Lmod = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return
      leafletRef.current = Lmod

      const start: [number, number] = lat != null && lon != null ? [lat, lon] : DEFAULT_CENTER
      const map = Lmod.map(containerRef.current, { zoomControl: true, attributionControl: false })
        .setView(start, lat != null && lon != null ? 14 : DEFAULT_ZOOM)
      mapRef.current = map

      Lmod.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        maxZoom: 18,
        attribution: '© OpenStreetMap',
      }).addTo(map)
      Lmod.control.attribution({ prefix: false }).addTo(map)

      const icon = Lmod.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#2d7a3d;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);transform:rotate(-45deg)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 18],
      })

      const marker = Lmod.marker(start, { icon, draggable: true }).addTo(map)
      markerRef.current = marker

      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onPickRef.current(p.lat, p.lng)
      })

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng)
        onPickRef.current(e.latlng.lat, e.latlng.lng)
      })

      if (radiusKm != null) {
        circleRef.current = Lmod.circle(start, { ...CIRCLE_STYLE, radius: radiusKm * 1000 }).addTo(map)
      }
    })()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markerRef.current = null
      circleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincronizza marker/vista/cerchio quando il punto arriva da una ricerca (non da un tocco
  // dell'utente sulla mappa) o quando cambia il raggio — senza questo effetto la mappa restava
  // ferma sul centro iniziale anche dopo che una ricerca risolveva un nuovo luogo (bug
  // preesistente, indipendente dal raggio: si applica anche a chi non lo usa, es. SectionIndirizzo.tsx).
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    const Lmod = leafletRef.current
    if (!map || !marker || !Lmod || lat == null || lon == null) return

    const current = marker.getLatLng()
    const moved = Math.abs(current.lat - lat) > 1e-9 || Math.abs(current.lng - lon) > 1e-9
    if (moved) marker.setLatLng([lat, lon])

    if (radiusKm != null) {
      if (circleRef.current) circleRef.current.remove()
      circleRef.current = Lmod.circle([lat, lon], { ...CIRCLE_STYLE, radius: radiusKm * 1000 }).addTo(map)
      map.fitBounds(circleRef.current.getBounds(), { maxZoom: 15 })
    } else if (moved) {
      map.setView([lat, lon], 14)
    }
  }, [lat, lon, radiusKm])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className={`w-full overflow-hidden bg-stone-100 cursor-crosshair ${rounded ? 'rounded-xl' : ''}`}
    />
  )
}
