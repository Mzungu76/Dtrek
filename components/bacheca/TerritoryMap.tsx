'use client'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
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

export type TerritoryRouteCategory = 'planned' | 'suggested'

export interface TerritoryRoute {
  key: string
  polyline: [number, number][]
  category: TerritoryRouteCategory
}

// Stessa lettura cromatica già in uso altrove in Bacheca: forest per i percorsi già pianificati
// dall'utente (RouteThumb di default per "Altre uscite in programma"), terra per quelli proposti
// da DTrek (badge "Consigliato"/reasonTag di "Percorsi suggeriti") — qui riproposta come legenda
// invece che come badge, per distinguere le due categorie di tracciati sulla stessa mappa.
const ROUTE_CATEGORY_COLOR: Record<TerritoryRouteCategory, string> = {
  planned: '#2d7a3d',
  suggested: '#d97220',
}
const ROUTE_CATEGORY_LABEL: Record<TerritoryRouteCategory, string> = {
  planned: 'In programma',
  suggested: 'Suggeriti',
}

interface Props {
  pois: TerritoryPoi[]
  routes?: TerritoryRoute[]
  height?: string
  interactive?: boolean
}

/**
 * Mappa dei luoghi citati in "Da sapere sui tuoi percorsi" (app/bacheca/page.tsx), affiancati ai
 * tracciati delle altre due righe della Home — stessa coppia icona/colore per tipo (poiBadgeMarkup
 * + POI_META) di MapView/NavigationMap per i POI, con un'etichetta col nome sempre visibile
 * accanto al marker (qui i luoghi non sono su un unico tracciato con cui l'utente possa già
 * orientarsi, quindi il nome non può restare solo al tocco come altrove).
 *
 * I POI sono raggruppati (leaflet.markercluster) invece che singoli L.marker: sparsi su più
 * percorsi anche lontani tra loro, la mappa deve restare zoomata abbastanza da contenerli tutti —
 * a quello zoom, POI vicini tra loro (es. sullo stesso percorso) finiscono altrimenti impilati
 * sullo stesso pixel, col marker più recente che nasconde tutti gli altri sotto di sé: non erano
 * mai spariti dai dati, solo invisibili l'uno sopra l'altro.
 */
export default function TerritoryMap({ pois, routes = [], height = '200px', interactive = true }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const validPois = pois.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  const validRoutes = routes.filter(r => r.polyline && r.polyline.length > 1)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (validPois.length === 0 && validRoutes.length === 0) return

    let cancelled = false
    import('leaflet').then(async L => {
      if (cancelled || !mapRef.current || mapInstance.current) return

      // leaflet.markercluster è un plugin "vecchio stile" che si aspetta L già globale (come da
      // un tag <script>, non da un import ESM/CJS) — senza questa riga il suo codice interno
      // (`L.MarkerClusterGroup = L.FeatureGroup.extend(...)`) lancia un ReferenceError su `L` non
      // definito appena importato in un bundle Next.js.
      ;(window as unknown as { L: typeof L }).L = L
      await import('leaflet.markercluster')

      if (cancelled || !mapRef.current || mapInstance.current) return

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

      const allBounds: L.LatLngBounds[] = []

      for (const route of validRoutes) {
        const line = L.polyline(route.polyline, {
          color: ROUTE_CATEGORY_COLOR[route.category],
          weight: 3,
          opacity: 0.75,
          smoothFactor: 1.5,
        }).addTo(map)
        allBounds.push(line.getBounds())
      }

      if (validPois.length > 0) {
        const clusterGroup = L.markerClusterGroup({
          maxClusterRadius: 50,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (cluster) => L.divIcon({
            className: '',
            html: `<div style="width:30px;height:30px;border-radius:50%;background:#57534e;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${cluster.getChildCount()}</div>`,
            iconSize: [30, 30],
          }),
        })
        for (const poi of validPois) {
          const meta = POI_META[poi.type]
          const icon = L.divIcon({
            className: '',
            html: poiBadgeMarkup(poi.type, meta?.color ?? '#d97220', 24),
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })
          const marker = L.marker([poi.lat, poi.lon], { icon, title: poi.name })
          marker.bindTooltip(poi.name, {
            permanent: true,
            direction: 'right',
            offset: [8, 0],
            className: 'territory-map-label',
          })
          clusterGroup.addLayer(marker)
        }
        clusterGroup.addTo(map)
        allBounds.push(clusterGroup.getBounds())
      }

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0])
        map.fitBounds(combined, { padding: [32, 32], maxZoom: 13 })
      }

      // Stesso motivo di AllRoutesMap.tsx: il contenitore può cambiare dimensione dopo il primo
      // render (qui, tipicamente, quando questa mappa passa dalla riga compatta in Bacheca al
      // foglio a comparsa più grande) e Leaflet non se ne accorge da solo.
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro
    })

    return () => {
      cancelled = true
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

  if (validPois.length === 0 && validRoutes.length === 0) return null

  return (
    <div className="relative">
      <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden border border-stone-200 shadow-sm" />
      {validRoutes.some(r => r.category === 'planned') && validRoutes.some(r => r.category === 'suggested') && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-[9.5px] font-semibold text-stone-600 shadow-sm">
          {(['planned', 'suggested'] as const).map(cat => (
            <span key={cat} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ROUTE_CATEGORY_COLOR[cat] }} />
              {ROUTE_CATEGORY_LABEL[cat]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
