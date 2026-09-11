'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { FOREST, TERRA } from '@/lib/designTokens'

export interface MapPin {
  id: string
  title: string
  lat: number
  lon: number
  kind: 'guide' | 'resoconto'
}

interface Props {
  pins: MapPin[]
  height?: string
  /** Vedi lo stesso prop di AllRoutesMap.tsx: senza pin, disegna comunque una mappa di base qui
   *  invece del placeholder testuale — l'hero della Dashboard (Direzione E) la usa per un utente
   *  nuovo senza ancora nessuna Guida/Resoconto proprio. */
  emptyFallback?: { center: [number, number]; zoom: number }
  className?: string
}

const GUIDE_COLOR = FOREST[600]
const RESOCONTO_COLOR = TERRA[600]

/** Seconda vista dell'hero "Direzione E" (docs/mockup-dashboard-hero/DirezioneEGuide.dc.html):
 *  invece delle tracce di AllRoutesMap.tsx, un pin per ogni Guida (Meta pianificata,
 *  lib/plannedStore.ts) e ogni Resoconto (attività, lib/blobStore.ts) — più leggibile delle tracce
 *  sovrapposte quando sono tante, e risponde a "dove sono stato/dove voglio tornare" invece di
 *  "che percorsi ho fatto". Nessun clustering reale (il mockup ne mostrava uno a titolo di
 *  esempio): richiederebbe leaflet.markercluster, non ancora una dipendenza del progetto — pin
 *  vicini restano semplicemente sovrapposti, cliccabili singolarmente come qualunque marker Leaflet. */
export default function GuideResocontiMap({ pins, height = '500px', emptyFallback, className = 'overflow-hidden' }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (pins.length === 0 && !emptyFallback) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      const initialView = pins.length === 0 && emptyFallback ? emptyFallback : { center: [44, 11] as [number, number], zoom: 7 }
      const map = L.map(mapRef.current!, {
        dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        touchZoom: false, boxZoom: false, keyboard: false,
      }).setView(initialView.center, initialView.zoom)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const bounds: L.LatLngBoundsExpression = []
      for (const pin of pins) {
        const color = pin.kind === 'guide' ? GUIDE_COLOR : RESOCONTO_COLOR
        L.circleMarker([pin.lat, pin.lon], {
          radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95,
        }).bindPopup(`<strong style="color:${color}">${pin.title}</strong>`).addTo(map)
        bounds.push([pin.lat, pin.lon])
      }
      if (bounds.length > 0) map.fitBounds(bounds, { padding: [24, 24] })

      // Vedi lo stesso commento in AllRoutesMap.tsx: Leaflet misura il contenitore una volta sola
      // alla creazione e va aggiornato a mano se le sue dimensioni cambiano dopo il primo render.
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro
    })

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (pins.length === 0 && !emptyFallback) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-stone-100 border border-stone-200 text-stone-400 text-sm"
        style={{ height }}
      >
        Nessuna Guida o Resoconto ancora
      </div>
    )
  }

  return <div ref={mapRef} style={{ height }} className={className} />
}
