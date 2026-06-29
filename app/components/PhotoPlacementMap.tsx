'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TrackPoint } from '@/lib/tcxParser'
import { updateActivityPhoto, type RoutePhoto } from '@/lib/activityPhotos'
import { X, MapPin, AlertTriangle } from 'lucide-react'

interface Props {
  trackPoints: TrackPoint[]
  photos: RoutePhoto[]
  onClose: () => void
  onUpdate: () => void
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getPhotoPos(ph: RoutePhoto, pts: TrackPoint[]): { lat: number; lon: number } | null {
  if (ph.hasExifGps && ph.lat && ph.lon) return { lat: ph.lat, lon: ph.lon }
  const idx = Math.round(ph.progress * (pts.length - 1))
  const pt  = pts[Math.min(idx, pts.length - 1)]
  return pt.lat && pt.lon ? { lat: pt.lat, lon: pt.lon } : null
}

export default function PhotoPlacementMap({
  trackPoints, photos: initialPhotos, onClose, onUpdate,
}: Props) {
  const mapRef        = useRef<HTMLDivElement>(null)
  const mapInstance   = useRef<any>(null)
  const pinMarkersRef = useRef<Map<string, any>>(new Map())
  const selectedIdRef = useRef<string | null>(null)
  const localPhotosRef = useRef<RoutePhoto[]>([])
  const [error, setError] = useState<string | null>(null)

  const gpsPoints = trackPoints.filter(p => p.lat && p.lon)

  const initSorted = [...initialPhotos].sort((a, b) => a.progress - b.progress)
  const [localPhotos, setLocalPhotos] = useState<RoutePhoto[]>(initSorted)
  const [selectedId,  setSelectedId]  = useState<string | null>(
    // prefer first unpositioned photo, fallback to first
    initSorted.find(p => !p.hasExifGps && p.progress === 0.5)?.id ?? initSorted[0]?.id ?? null,
  )
  const [mapReady, setMapReady] = useState(false)

  // keep refs in sync so the map click handler (registered once) always sees current values
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { localPhotosRef.current = localPhotos }, [localPhotos])

  // ── Leaflet init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current || gpsPoints.length < 2) return

    if (!document.querySelector('#leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    import('leaflet').then(L => {
      const coords: [number, number][] = gpsPoints.map(p => [p.lat!, p.lon!])
      const map = L.map(mapRef.current!, { zoomControl: true }).setView(coords[0], 13)
      mapInstance.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const poly = L.polyline(coords, { color: '#378d44', weight: 4, opacity: 0.85 }).addTo(map)
      map.fitBounds(poly.getBounds(), { padding: [28, 28] })

      const mkIcon = (label: string, color: string) => L.divIcon({
        html: `<div style="background:${color};color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${label}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12], className: '',
      })
      L.marker(coords[0],              { icon: mkIcon('S', '#378d44') }).addTo(map)
      L.marker(coords[coords.length-1],{ icon: mkIcon('A', '#c05a17') }).addTo(map)

      // Click on map → place selected photo
      map.on('click', (e: any) => {
        const sid = selectedIdRef.current
        if (!sid) return
        const { lat, lng } = e.latlng
        let minD = Infinity, bestIdx = 0
        gpsPoints.forEach((pt, i) => {
          const d = haversineM(pt.lat!, pt.lon!, lat, lng)
          if (d < minD) { minD = d; bestIdx = i }
        })
        const progress = bestIdx / (gpsPoints.length - 1)
        const nearPt   = gpsPoints[bestIdx]

        const updated = localPhotosRef.current.map(p =>
          p.id === sid ? { ...p, progress, lat: nearPt.lat!, lon: nearPt.lon! } : p,
        )
        const sorted = [...updated].sort((a, b) => a.progress - b.progress)
        setLocalPhotos(sorted)
        // advance to next in route order
        const newIdx = sorted.findIndex(p => p.id === sid)
        const nextId = sorted[(newIdx + 1) % sorted.length]?.id ?? null
        setSelectedId(nextId)

        updateActivityPhoto(sid, { progress, lat: nearPt.lat!, lon: nearPt.lon! })
          .then(onUpdate)
          .catch(() => {
            setError('Posizionamento foto non riuscito. Riprova.')
            onUpdate()
          })
      })

      setMapReady(true)
    })

    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Photo pins (re-render when photos or selection changes) ───────────────────
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return
    import('leaflet').then(L => {
      pinMarkersRef.current.forEach(m => m.remove())
      pinMarkersRef.current.clear()
      localPhotos.forEach((ph, i) => {
        const pos = getPhotoPos(ph, gpsPoints)
        if (!pos) return
        const sel  = ph.id === selectedId
        const size = sel ? 28 : 22
        const icon = L.divIcon({
          html: `<div style="background:${sel ? '#d97706' : '#f59e0b'};color:white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${sel ? 11 : 9}px;font-weight:bold;border:${sel ? 3 : 2}px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.45)">${i + 1}</div>`,
          iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '',
        })
        const m = L.marker([pos.lat, pos.lon], { icon })
          .addTo(mapInstance.current)
          .bindTooltip(`${i + 1}. ${ph.caption}`, { direction: 'top', offset: [0, -8] })
          .on('click', (e: any) => {
            L.DomEvent.stopPropagation(e)
            setSelectedId(ph.id)
          })
        pinMarkersRef.current.set(ph.id, m)
      })
    })
  }, [localPhotos, selectedId, mapReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPhoto = localPhotos.find(p => p.id === selectedId)

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-3xl overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 shrink-0">
          <div>
            <h3 className="font-barlow font-bold text-stone-700 uppercase tracking-wide text-sm">
              Posiziona le foto sul percorso
            </h3>
            <p className="font-lora text-xs italic text-stone-400 mt-0.5">
              {selectedPhoto
                ? `"${selectedPhoto.caption}" — clicca sulla mappa per posizionarla`
                : 'Seleziona una foto qui sotto, poi clicca sulla mappa'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-stone-100 text-stone-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border-b border-red-200 px-5 py-2 shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-600 leading-snug">{error}</p>
          </div>
        )}

        {/* Map */}
        <div
          ref={mapRef}
          className="flex-1 min-h-0"
          style={{ minHeight: 300, cursor: selectedId ? 'crosshair' : 'default' }}
        />

        {/* Photo strip */}
        {localPhotos.length > 0 && (
          <div className="shrink-0 border-t border-stone-100 bg-stone-50 p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {localPhotos.map((ph, i) => {
                const positioned = ph.hasExifGps || ph.progress !== 0.5
                return (
                  <button key={ph.id} onClick={() => setSelectedId(ph.id)}
                    className={`shrink-0 flex flex-col items-center gap-1 rounded-xl p-1.5 border-2 transition-colors ${
                      ph.id === selectedId
                        ? 'border-amber-400 bg-amber-50 shadow-sm'
                        : 'border-stone-200 bg-white hover:border-amber-200'
                    }`}>
                    <div className="relative">
                      <img src={ph.url} alt={ph.caption}
                        className="w-16 h-16 object-cover rounded-lg" />
                      <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center font-barlow">
                        {i + 1}
                      </span>
                      {positioned && (
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-forest-600 text-white rounded-full flex items-center justify-center">
                          <MapPin className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-stone-500 font-lora max-w-[68px] text-center truncate leading-tight">
                      {ph.caption}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
