'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'

interface Props {
  polyline: [number, number][]
  height?: string
  /** Bottone "espandi" in overlay che apre la stessa mappa a schermo intero — utile ovunque questa
   *  anteprima viva in un riquadro piccolo (card dei risultati di ricerca, dettaglio di una ricerca
   *  salvata) e l'utente voglia leggerla meglio senza dover aprire la vista 3D. */
  expandable?: boolean
  /** Angoli arrotondati propri — `false` quando il chiamante avvolge già questa mappa in un
   *  bordo strappato (components/TornFrame.tsx, TornBottomEdge): un angolo arrotondato non
   *  allineato allo strappo lascerebbe scoperto un pezzetto di riquadro, rivelando dietro il
   *  riempimento invisibile dell'ombra (stesso bug corretto in RouteMapSection/PoiMap/
   *  NatureGallery passando `bare` a MapView — qui non c'è un `bare` da passare, la rotondità
   *  vive direttamente su questo componente). Default `true`, invariato per gli altri chiamanti. */
  roundedCorners?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mountMap(container: HTMLDivElement, polyline: [number, number][]): Promise<{ map: any; line: any }> {
  const L = (await import('leaflet')).default
  const map = L.map(container, {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: false,
  })
  L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
    maxZoom: 18,
    attribution: '© OpenStreetMap',
  }).addTo(map)
  L.control.attribution({ prefix: false }).addTo(map)

  const line = L.polyline(polyline, { color: '#2d7a3d', weight: 4, opacity: 0.9 }).addTo(map)
  map.fitBounds(line.getBounds(), { padding: [24, 24] })

  const dotIcon = (color: string) => L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
  L.marker(polyline[0], { icon: dotIcon('#16a34a') }).addTo(map)
  L.marker(polyline[polyline.length - 1], { icon: dotIcon('#dc2626') }).addTo(map)
  return { map, line }
}

function ExpandedMap({ polyline, onClose }: { polyline: [number, number][]; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!containerRef.current || polyline.length < 2) return
    let cancelled = false
    mountMap(containerRef.current, polyline).then(({ map, line }) => {
      if (cancelled) { map.remove(); return }
      mapRef.current = map
      // Il riquadro a schermo intero può non avere ancora la dimensione finale al primo giro (il
      // portale è appena entrato nel DOM) — un secondo fit dalla stessa coda rAF corregge senza
      // lasciare parte della traccia fuori vista (stessa correzione di CoverMap.tsx).
      requestAnimationFrame(() => { map.invalidateSize(); map.fitBounds(line.getBounds(), { padding: [24, 24] }) })
    })
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [polyline])

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full h-full max-w-4xl max-h-[85vh] rounded-2xl overflow-hidden bg-stone-100" onClick={e => e.stopPropagation()}>
        <div ref={containerRef} className="w-full h-full" />
        <button
          onClick={onClose}
          aria-label="Chiudi mappa"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/75 backdrop-blur-md flex items-center justify-center text-white transition-colors"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>,
    document.body,
  )
}

export default function TrailPreviewMap({ polyline, height = '220px', expandable = false, roundedCorners = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<unknown>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!containerRef.current || polyline.length < 2) return

    // Destroy existing instance before re-init (React strict mode / hot reload)
    if (mapRef.current) {
      (mapRef.current as { remove(): void }).remove()
      mapRef.current = null
    }

    let cancelled = false

    mountMap(containerRef.current, polyline).then(({ map }) => {
      if (cancelled) { map.remove(); return }
      mapRef.current = map
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        (mapRef.current as { remove(): void }).remove()
        mapRef.current = null
      }
    }
  }, [polyline])

  return (
    // h-full — quando `height` è "100%" (dentro un riquadro già alto un tot, es. TornBottomEdge)
    // serve un antenato con altezza definita da cui ereditarla; se il genitore non ne ha una
    // (i chiamanti esistenti con un px fisso, es. "180px"), resta "auto" come prima, invariato.
    <div className="relative h-full">
      <div
        ref={containerRef}
        style={{ height }}
        className={`w-full overflow-hidden bg-stone-100 ${roundedCorners ? 'rounded-xl' : ''}`}
      />
      {expandable && polyline.length >= 2 && (
        <button
          onClick={() => setExpanded(true)}
          title="Espandi la mappa"
          aria-label="Espandi la mappa"
          className="absolute bottom-3 right-3 z-[400] flex items-center justify-center w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white/90 hover:bg-black/65 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
      {expanded && <ExpandedMap polyline={polyline} onClose={() => setExpanded(false)} />}
    </div>
  )
}
