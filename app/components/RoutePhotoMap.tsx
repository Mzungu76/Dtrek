'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { TrackPoint } from '@/lib/tcxParser'

interface RoutePhoto {
  id: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

interface Props {
  trackPoints: TrackPoint[]
  photos: RoutePhoto[]
  height?: string
}

function getPhotoLatLon(ph: RoutePhoto, pts: TrackPoint[]): { lat: number; lon: number } | null {
  if (ph.hasExifGps && ph.lat && ph.lon) return { lat: ph.lat, lon: ph.lon }
  const idx = Math.round(ph.progress * (pts.length - 1))
  const pt  = pts[Math.min(idx, pts.length - 1)]
  return pt.lat && pt.lon ? { lat: pt.lat, lon: pt.lon } : null
}

export default function RoutePhotoMap({ trackPoints, photos, height = '180px' }: Props) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)

  const gpsPoints = trackPoints.filter(p => p.lat && p.lon)
  const sorted    = [...photos].sort((a, b) => a.progress - b.progress)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || gpsPoints.length < 2) return

    import('leaflet').then(L => {
      const coords: [number, number][] = gpsPoints.map(p => [p.lat!, p.lon!])
      const map = L.map(mapRef.current!, {
        zoomControl:       false,
        attributionControl: false,
        scrollWheelZoom:   false,
        dragging:          true,
        doubleClickZoom:   false,
      }).setView(coords[0], 13)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { maxZoom: 19 }).addTo(map)

      const poly = L.polyline(coords, { color: '#378d44', weight: 3, opacity: 0.9 }).addTo(map)
      map.fitBounds(poly.getBounds(), { padding: [14, 14] })

      sorted.forEach((ph, i) => {
        const pos = getPhotoLatLon(ph, gpsPoints)
        if (!pos) return
        const icon = L.divIcon({
          html: `<div style="background:#f59e0b;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)">${i + 1}</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10], className: '',
        })
        L.marker([pos.lat, pos.lon], { icon })
          .addTo(map)
          .bindTooltip(`${i + 1}. ${ph.caption}`, { direction: 'top', offset: [0, -6] })
      })
    })

    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!gpsPoints.length) return null

  return <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden" />
}
