'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { POI_META, type PoiType } from '@/lib/overpass'
import { poiBadgeMarkup } from '@/components/poiIcons'

export interface TerritoryPoi {
  key: string
  lat: number
  lon: number
  name: string
  type: PoiType
}

interface Props {
  pois: TerritoryPoi[]
  height?: string
  interactive?: boolean
}

/**
 * Mappa dei luoghi citati in "Da sapere sui tuoi percorsi" (app/bacheca/page.tsx) — stessa coppia
 * icona/colore per tipo (poiBadgeMarkup + POI_META) di MapView/NavigationMap, con un'etichetta
 * col nome sempre visibile accanto al marker (qui i luoghi non sono su un unico tracciato con cui
 * l'utente possa già orientarsi, quindi il nome non può restare solo al tocco come altrove).
 */
export default function TerritoryMap({ pois, height = '200px', interactive = true }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const validPois = pois.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (validPois.length === 0) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      const map = L.map(mapRef.current!, {
        dragging: interactiveRef.current,
        scrollWheelZoom: interactiveRef.current,
        doubleClickZoom: interactiveRef.current,
        touchZoom: interactiveRef.current,
        boxZoom: interactiveRef.current,
        keyboard: interactiveRef.current,
        zoomControl: interactiveRef.current,
      }).setView([44, 11], 7)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const markerBounds: L.LatLng[] = []
      for (const poi of validPois) {
        const meta = POI_META[poi.type]
        const icon = L.divIcon({
          className: '',
          html: poiBadgeMarkup(poi.type, meta?.color ?? '#d97220', 24),
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })
        const marker = L.marker([poi.lat, poi.lon], { icon, title: poi.name }).addTo(map)
        marker.bindTooltip(poi.name, {
          permanent: true,
          direction: 'right',
          offset: [8, 0],
          className: 'territory-map-label',
        })
        markerBounds.push(marker.getLatLng())
      }

      if (markerBounds.length > 0) {
        map.fitBounds(L.latLngBounds(markerBounds), { padding: [32, 32], maxZoom: 13 })
      }

      // Stesso motivo di AllRoutesMap.tsx: il contenitore può cambiare dimensione dopo il primo
      // render (qui, tipicamente, quando questa mappa passa dalla riga compatta in Bacheca al
      // foglio a comparsa più grande) e Leaflet non se ne accorge da solo.
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

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    const handlers = [map.dragging, map.scrollWheelZoom, map.doubleClickZoom, map.touchZoom, map.boxZoom, map.keyboard]
    handlers.forEach(h => { if (h) interactive ? h.enable() : h.disable() })
  }, [interactive])

  if (validPois.length === 0) return null

  return (
    <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden border border-stone-200 shadow-sm" />
  )
}
