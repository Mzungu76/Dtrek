'use client'
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
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || !polyline || polyline.length < 2) return
    let cancelled = false
    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, {
        zoomControl: false, dragging: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, attributionControl: false,
      })
      mapInstance.current = map
      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { maxZoom: 19 }).addTo(map)
      const line = L.polyline(polyline, { color: '#f2cd9d', weight: 5, opacity: 0.95 }).addTo(map)
      map.fitBounds(line.getBounds(), { padding: [28, 28] })
    })
    return () => {
      cancelled = true
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
