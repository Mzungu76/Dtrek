'use client'

import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
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
  /** Fired when a numbered pin is tapped — apre il lightbox sulla foto corrispondente (vedi
   *  "Foto sulla mappa" in components/resoconto/ReportReader.tsx). Assente per l'uso come
   *  mini-mappa puramente illustrativa. */
  onPhotoTap?: (photoId: string) => void
  /** Pan/zoom nativi attivi o no — di norma bloccata (vedi components/resoconto/PhotoMapSection.tsx,
   *  stesso lucchetto di components/RouteMapSection.tsx) così lo scroll della pagina non la sposta
   *  involontariamente. Default true per l'uso come mini-mappa illustrativa (mai bloccata lì). */
  interactive?: boolean
  /** Incrementato dal chiamante per reinquadrare tutto il percorso (bottone "Inquadra"). */
  fitSignal?: number
}

function getPhotoLatLon(ph: RoutePhoto, pts: TrackPoint[]): { lat: number; lon: number } | null {
  if (ph.hasExifGps && ph.lat && ph.lon) return { lat: ph.lat, lon: ph.lon }
  const idx = Math.round(ph.progress * (pts.length - 1))
  const pt  = pts[Math.min(idx, pts.length - 1)]
  return pt.lat && pt.lon ? { lat: pt.lat, lon: pt.lon } : null
}

export default function RoutePhotoMap({ trackPoints, photos, height = '180px', onPhotoTap, interactive = true, fitSignal }: Props) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const polyRef     = useRef<L.Polyline | null>(null)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const gpsPoints = trackPoints.filter(p => p.lat && p.lon)
  const sorted    = [...photos].sort((a, b) => a.progress - b.progress)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current || gpsPoints.length < 2) return
    let cancelled = false

    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return
      const coords: [number, number][] = gpsPoints.map(p => [p.lat!, p.lon!])
      const map = L.map(mapRef.current, {
        zoomControl:       false,
        attributionControl: false,
        scrollWheelZoom:   interactiveRef.current,
        dragging:          interactiveRef.current,
        doubleClickZoom:   false,
        touchZoom:         interactiveRef.current,
      }).setView(coords[0], 13)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { maxZoom: 19 }).addTo(map)

      const poly = L.polyline(coords, { color: '#378d44', weight: 3, opacity: 0.9 }).addTo(map)
      polyRef.current = poly
      map.fitBounds(poly.getBounds(), { padding: [14, 14] })

      sorted.forEach((ph, i) => {
        const pos = getPhotoLatLon(ph, gpsPoints)
        if (!pos) return
        const icon = L.divIcon({
          html: `<div style="background:#f59e0b;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)${onPhotoTap ? ';cursor:pointer' : ''}">${i + 1}</div>`,
          iconSize: [20, 20], iconAnchor: [10, 10], className: '',
        })
        const marker = L.marker([pos.lat, pos.lon], { icon })
          .addTo(map)
          .bindTooltip(`${i + 1}. ${ph.caption}`, { direction: 'top', offset: [0, -6] })
        if (onPhotoTap) marker.on('click', () => onPhotoTap(ph.id))
      })

      // La mappa cambia dimensioni quando si entra/esce da schermo intero (vedi
      // components/resoconto/PhotoMapSection.tsx) — senza invalidateSize() i tile restano
      // renderizzati alla vecchia dimensione finché non si interagisce manualmente.
      const resizeObserver = new ResizeObserver(() => map.invalidateSize())
      resizeObserver.observe(mapRef.current)
      map.once('unload', () => resizeObserver.disconnect())
    })

    return () => {
      cancelled = true
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Blocca/sblocca il pan/zoom nativo — il lucchetto in PhotoMapSection.
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    if (interactive) { map.dragging.enable(); map.scrollWheelZoom.enable(); map.touchZoom.enable() }
    else { map.dragging.disable(); map.scrollWheelZoom.disable(); map.touchZoom.disable() }
  }, [interactive])

  // "Inquadra tutto il percorso" — reinquadra sulla polilinea ogni volta che il chiamante
  // incrementa fitSignal: sia per il bottone "Inquadra" esplicito, sia (PhotoMapSection) subito
  // dopo il passaggio a schermo intero, dove è quello che tiene effettivamente aggiornate le
  // dimensioni interne di Leaflet — il solo ResizeObserver a volte vince la corsa col reflow del
  // contenitore e la mappa restava inquadrata (e le foto quindi "sparite") alle vecchie dimensioni
  // strette. Chiamato due volte (subito + al prossimo frame) perché il primo invalidateSize può
  // ancora leggere le dimensioni del contenitore un istante prima che il passaggio a
  // `position: fixed; inset: 0` sia stato applicato dal browser.
  useEffect(() => {
    if (fitSignal == null) return
    const map = mapInstance.current
    const poly = polyRef.current
    if (!map || !poly) return
    map.invalidateSize()
    map.fitBounds(poly.getBounds(), { padding: [14, 14] })
    const raf = requestAnimationFrame(() => {
      map.invalidateSize()
      map.fitBounds(poly.getBounds(), { padding: [14, 14] })
    })
    return () => cancelAnimationFrame(raf)
  }, [fitSignal])

  if (!gpsPoints.length) return null

  return <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden" />
}
