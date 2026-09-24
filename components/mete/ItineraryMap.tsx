'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import type { ItineraryLeg, ItineraryStop } from '@/app/api/borgo-itinerary/route'

interface Props {
  center: { lat: number; lon: number }
  stops: ItineraryStop[]
  legs: ItineraryLeg[]
  color: string
  height?: string
  /** Punti "spenti" dall'utente (piano guide-eccellenza Fase 2, verifica utente: "renderli
   *  semitrasparenti in mappa") — mostrati senza numero né tragitto, solo un marker attenuato a
   *  indicare che esistono ma non fanno parte dell'itinerario corrente; mai rimossi del tutto. */
  dimmedStops?: ItineraryStop[]
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
}

// Stesso taglio del popup POI di un Sentiero (lib/overpass.ts's buildPoiPopupHtml) — nome, foto se
// disponibile, descrizione se disponibile: mai solo il numero/nome nudo come prima (verifica
// utente, piano guide-eccellenza). Mostrato SOLO a schermo intero (vedi namePopupHtml sotto) —
// verifica utente: a mappa normale lo spazio è stretto, un popup con foto/testo lungo copre metà
// mappa e costringe a chiuderlo subito; a schermo intero c'è spazio per leggerlo comodamente.
function stopPopupHtml(n: string, name: string, stop?: ItineraryStop): string {
  const thumb = stop?.thumbnail
    ? `<img src="${stop.thumbnail}" alt="" style="width:100%;height:90px;object-fit:cover;border-radius:8px;margin-bottom:6px" />`
    : ''
  const desc = stop?.description
    ? `<div style="color:#4b5563;font-size:11px;line-height:1.4;margin-top:3px">${escapeHtml(stop.description)}</div>`
    : ''
  return `
  <div style="font-family:system-ui,sans-serif;min-width:170px;max-width:230px;font-size:12px">
    ${thumb}
    <div style="font-weight:700;font-size:13px;color:#111827;line-height:1.3">${n}. ${escapeHtml(name)}</div>
    ${desc}
  </div>`
}

// Solo il nome (e il numero d'ordine) — la versione a mappa NON a schermo intero, vedi il
// commento su stopPopupHtml sopra.
function namePopupHtml(n: string, name: string): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:13px;font-weight:700;color:#111827;white-space:nowrap">${n}. ${escapeHtml(name)}</div>`
}

const chipBase = 'flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-md border transition-colors shrink-0 bg-black/50 border-white/15 text-white/90'

/** Mappa dell'itinerario a piedi di un Borgo/Città — un tracciato reale (leg.real) disegnato pieno,
 *  una linea d'aria di ripiego (nessun cammino trovato per quella tappa) tratteggiata, mai lo
 *  stesso stile per entrambi: l'utente deve poter distinguere a colpo d'occhio dove la mappa sta
 *  davvero seguendo le vie e dove sta solo indicando una direzione. Marker numerati nell'ordine di
 *  visita, il Borgo stesso come punto di partenza (0). Ampliabile a tutto schermo (stesso pattern
 *  di components/guida/PoiMap.tsx) — verifica utente: prima restava sempre alla sua altezza fissa,
 *  scomoda per leggere i popup delle tappe più fitte. */
export default function ItineraryMap({ center, stops, legs, color, height = '320px', dimmedStops = [] }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  // I marker sono creati una sola volta al mount (useEffect con deps [] sotto, stesso motivo già
  // spiegato per la key della mappa in BorgoTappeWidget) — un ref invece di leggere `fullscreen`
  // direttamente lascia al popup (bindPopup con una funzione, richiamata da Leaflet ad ogni
  // apertura) la possibilità di mostrare il contenuto giusto per lo stato ATTUALE, anche se
  // l'utente cambia schermo intero mentre la mappa è già montata.
  const fullscreenRef = useRef(false)
  fullscreenRef.current = fullscreen

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return

      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(mapRef.current!, { scrollWheelZoom: false })
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const boundsPoints: [number, number][] = [
        [center.lat, center.lon],
        ...stops.map(s => [s.lat, s.lon] as [number, number]),
        ...dimmedStops.map(s => [s.lat, s.lon] as [number, number]),
      ]

      for (const leg of legs) {
        L.polyline(leg.polyline, {
          color,
          weight: 4,
          opacity: leg.real ? 0.85 : 0.6,
          dashArray: leg.real ? undefined : '6 8',
        }).addTo(map)
      }

      function numberedIcon(n: string, bg: string) {
        return L.divIcon({
          className: '',
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${bg};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700">${n}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          popupAnchor: [0, -13],
        })
      }

      const startMarker = L.marker([center.lat, center.lon], { icon: numberedIcon('B', '#44403c') })
      startMarker.bindPopup(`<strong>Partenza</strong>`, { maxWidth: 250 })
      startMarker.addTo(map)

      stops.forEach((stop, i) => {
        const marker = L.marker([stop.lat, stop.lon], { icon: numberedIcon(String(i + 1), color) })
        // Leaflet richiama questa funzione ad ogni apertura del popup, non solo alla creazione —
        // legge fullscreenRef.current al momento del click, mai quello (magari già superato) di
        // quando il marker è stato costruito.
        marker.bindPopup(
          () => fullscreenRef.current ? stopPopupHtml(String(i + 1), stop.name, stop) : namePopupHtml(String(i + 1), stop.name),
          { maxWidth: 250 },
        )
        marker.addTo(map)
      })

      // Punti spenti — un'icona attenuata (opacity, nessun numero d'ordine: non fanno parte del
      // percorso), mai una linea che li collega: restano visibili solo come promemoria "qui c'è
      // ancora qualcosa, riattivabile" (verifica utente).
      dimmedStops.forEach(stop => {
        const marker = L.marker([stop.lat, stop.lon], { icon: numberedIcon('·', '#a8a29e'), opacity: 0.45 })
        marker.bindPopup(
          () => fullscreenRef.current ? stopPopupHtml('Spento', stop.name, stop) : namePopupHtml('Spento', stop.name),
          { maxWidth: 250 },
        )
        marker.addTo(map)
      })

      if (boundsPoints.length > 0) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [24, 24] })
      } else {
        map.setView([center.lat, center.lon], 15)
      }

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

  // Il ResizeObserver sopra già chiama invalidateSize() quando il container cambia dimensione (il
  // toggle fullscreen lo fa), quindi qui non serve altro — a differenza di PoiMap.tsx, che passa
  // resizeSignal a un MapView separato invece di possedere l'istanza Leaflet direttamente.
  const toggleFullscreen = () => setFullscreen(v => !v)

  return (
    <div
      className={fullscreen ? 'fixed inset-0 z-[70] bg-black isolate' : 'relative isolate rounded-xl overflow-hidden border border-stone-200'}
      style={fullscreen ? undefined : { height }}
    >
      <div ref={mapRef} style={{ height: '100%' }} />
      <div
        className="absolute inset-x-3 z-[1000] flex items-center justify-end pointer-events-none"
        style={{ top: fullscreen ? 'calc(env(safe-area-inset-top, 0px) + 12px)' : '10px' }}
      >
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? 'Esci da schermo intero' : 'Schermo intero'}
          className={`${chipBase} pointer-events-auto`}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}
