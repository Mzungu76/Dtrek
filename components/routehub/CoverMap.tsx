'use client'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'

interface Props {
  polyline?: [number, number][]
}

/**
 * Decorative, non-interactive route map used as the Screen 1 "magazine cover" background when no
 * real cover photo exists (always the case for Guida, fallback for Resoconto before any photo is
 * attached). Same static-Leaflet-instance pattern as BottomGallery's GalleryMapThumb (all gestures
 * disabled), styled with a filter + color-tint overlay so it reads as a designed cover rather than
 * a raw map screenshot.
 */
export default function CoverMap({ polyline }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || !polyline || polyline.length < 2) return
    let cancelled = false
    let observer: ResizeObserver | null = null
    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, {
        zoomControl: false, dragging: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, attributionControl: false,
      })
      mapInstance.current = map
      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { maxZoom: 19 }).addTo(map)
      const line = L.polyline(polyline, { color: '#f2cd9d', weight: 5, opacity: 0.95 }).addTo(map)
      const fit = () => map.fitBounds(line.getBounds(), { padding: [28, 28] })
      fit()

      // Il contenitore (una card dentro il carosello swipeable di RouteHub) può essere ancora a
      // dimensione zero/sbagliata nel momento esatto in cui L.map() misura se stesso — succede a
      // intermittenza, non sempre (dipende dal timing dello swipe/layout), e senza correzione la
      // mappa carica le tile solo per il riquadro sbagliato misurato all'inizio, lasciando il
      // resto vuoto. Un ResizeObserver rifà sia invalidateSize (tile) sia fitBounds (inquadratura)
      // ogni volta che il contenitore raggiunge la sua vera dimensione, non solo una tantum.
      let raf = 0
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => { if (!cancelled) { map.invalidateSize(); fit() } })
      })
      observer.observe(mapRef.current)
    })
    return () => {
      cancelled = true
      observer?.disconnect()
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, [polyline])

  return (
    <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#123448] to-[#071824]">
      <div
        ref={mapRef}
        className="absolute inset-0"
        style={{ filter: 'saturate(1.35) contrast(1.12) brightness(0.78)' }}
      />
      {/* Color-grade tint in the app's own palette (terra/forest/deep navy), so the raw OSM tiles
          read as a designed magazine cover rather than a screenshot of a map. */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-multiply"
        style={{ background: 'linear-gradient(160deg, rgba(129,54,25,0.55) 0%, rgba(28,71,36,0.5) 55%, rgba(7,24,36,0.65) 100%)' }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.45)' }} />
    </div>
  )
}
