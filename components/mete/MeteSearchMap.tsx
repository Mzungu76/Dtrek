'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { META_TYPE_CONFIG, type MetaType } from '@/lib/metaTypes'
import { ROUTE_COLORS } from '@/lib/designTokens'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import { Loader2, RefreshCw } from 'lucide-react'

interface PercorsoPin {
  id: string
  title: string
  latitude: number
  longitude: number
}

interface CachedTrailItem {
  id: number
  name: string
  distanceKm: number | null
  elevationGain: number | null
  difficulty: string | null
  geometry: [number, number][]
}

const ITALY_CENTER: [number, number] = [42.5, 12.5]
const ITALY_ZOOM = 6
// Sotto questo zoom i Sentieri restano nascosti (stile Komoot: compaiono avvicinandosi, mai a
// scala nazionale/regionale dove sarebbero centinaia di pin sovrapposti) — Borghi/Città e Siti
// restano visibili a ogni zoom, l'archivio è ordini di grandezza più piccolo.
const PERCORSI_MIN_ZOOM = 10
const SEARCH_LIMIT = 60

const GLYPH: Record<MetaType, string> = { borgo_citta: '🏘️', sito: '🏛️', sentiero: '🥾', cammino: '🧭' }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c])
}

/**
 * Mappa di test per la ricerca unificata (docs/piano-ricerca-mete.md — questa non è ancora quella
 * pagina, solo un banco di prova): tre fonti insieme sulla stessa mappa, pin/linee colorati per
 * tipologia (stessi colori di lib/metaTypes.ts's META_TYPE_CONFIG) —
 *  - Borghi/Città e Siti (/api/meta-search, dtrek_places)
 *  - le Mete Sentiero salvate dall'utente (/api/percorsi, pin sul punto di partenza)
 *  - i sentieri già in cache da OSM (/api/trails-nearby → lib/trailsCache.ts's `trails`, stessa
 *    fonte già usata dalla ricerca "Esistenti" del wizard Costruisci-o-trova, qui però un elenco
 *    per l'area visibile invece che per un raggio scelto dall'utente), disegnati come tracciato
 *    reale (geometry_simplified) non come pin — sono percorsi, non punti.
 * Pattern "cerca in quest'area" stile Komoot: muovere la mappa non ricerca da sola, un pulsante lo
 * fa esplicitamente; i Sentieri (salvati e da cache) compaiono solo sotto PERCORSI_MIN_ZOOM di
 * distanza (zoom ravvicinato) — a scala nazionale sarebbero migliaia di tracciati sovrapposti.
 */
export default function MeteSearchMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const percorsiRef = useRef<PercorsoPin[]>([])
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  // Il primo 'moveend' arriva dal setView() di creazione della mappa, non da un pan/zoom
  // dell'utente — non deve accendere il pulsante "Cerca in quest'area" (la prima ricerca parte
  // già da sola, sotto).
  const initialMoveHandled = useRef(false)

  const [places, setPlaces] = useState<MetaSearchResultItem[]>([])
  const [percorsi, setPercorsi] = useState<PercorsoPin[]>([])
  const [cachedTrails, setCachedTrails] = useState<CachedTrailItem[]>([])
  const [zoom, setZoom] = useState(ITALY_ZOOM)
  const [searching, setSearching] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Le Mete Sentiero dell'utente non cambiano da un pan/zoom all'altro — una sola fetch, poi solo
  // filtro locale sul riquadro visibile ad ogni movimento (nessuna rete per quello).
  useEffect(() => {
    fetch('/api/percorsi')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(`Errore ${res.status}`)))
      .then((rows: { id: string; title: string; metaType: MetaType; latitude: number | null; longitude: number | null }[]) => {
        // /api/percorsi restituisce ogni Meta salvata dall'utente, non solo i Sentieri (include
        // anche un eventuale Borgo/Città o Sito già salvato in passato) — qui servono solo i
        // Sentieri: gli altri due tipi arrivano già dall'archivio via searchCurrentView(), mai da
        // qui, e un Sentiero è l'unico per cui "Apri" verso /guida/[id] ha senso.
        const withCoords: PercorsoPin[] = rows
          .filter(r => r.metaType === 'sentiero' && r.latitude != null && r.longitude != null)
          .map(r => ({ id: r.id, title: r.title, latitude: r.latitude as number, longitude: r.longitude as number }))
        percorsiRef.current = withCoords
        // La mappa può essersi già mossa/inizializzata prima che questa fetch tornasse — un
        // secondo giro del filtro locale la allinea invece di aspettare il prossimo pan/zoom.
        updatePercorsiForView()
      })
      .catch(e => { console.error('[MeteSearchMap] /api/percorsi', e) /* i Sentieri restano semplicemente assenti dalla mappa, mai un errore bloccante */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function searchCurrentView() {
    const map = mapInstance.current
    if (!map) return
    setSearching(true)
    setError(null)
    try {
      const bounds = map.getBounds()
      const center = bounds.getCenter()
      const radiusKm = center.distanceTo(bounds.getNorthEast()) / 1000
      const origin = { lat: center.lat, lon: center.lng }

      const [borghi, siti] = await Promise.all(
        (['borgo_citta', 'sito'] as const).map(async metaType => {
          const res = await fetch('/api/meta-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ metaType, origin, maxDistanceKm: radiusKm, limit: SEARCH_LIMIT }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
          return data.items as MetaSearchResultItem[]
        }),
      )
      setPlaces([...borghi, ...siti])

      // I sentieri da cache OSM restano dietro lo stesso zoom ravvicinato dei Sentieri salvati
      // dall'utente (PERCORSI_MIN_ZOOM) — a scala nazionale/regionale la cache ne ha migliaia,
      // nessuna ragione di scaricarli se poi restano nascosti.
      if (map.getZoom() >= PERCORSI_MIN_ZOOM) {
        const res = await fetch('/api/trails-nearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: origin.lat, lon: origin.lon, radiusKm }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
        setCachedTrails(data.items as CachedTrailItem[])
      } else {
        setCachedTrails([])
      }

      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricerca non riuscita')
    } finally {
      setSearching(false)
    }
  }

  function filterToBounds(pins: PercorsoPin[], bounds: L.LatLngBounds): PercorsoPin[] {
    return pins.filter(p => bounds.contains([p.latitude, p.longitude]))
  }

  // I Sentieri sono già tutti in memoria (percorsiRef, fetch unica sopra) — mostrarli/nasconderli
  // per zoom o riquadro è un filtro locale, nessuna ragione di aspettare il tap su "Cerca in
  // quest'area" (quel pulsante resta necessario solo per Borghi/Città e Siti, che vivono su
  // Supabase). Richiamata su ogni pan/zoom.
  function updatePercorsiForView() {
    const map = mapInstance.current
    if (!map) return
    const currentZoom = map.getZoom()
    setZoom(currentZoom)
    setPercorsi(currentZoom >= PERCORSI_MIN_ZOOM ? filterToBounds(percorsiRef.current, map.getBounds()) : [])
  }

  // Mappa Leaflet — creata una sola volta, stesso motore/tile proxy di AllRoutesMap.tsx.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return
      leafletRef.current = L

      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(mapRef.current!).setView(ITALY_CENTER, ITALY_ZOOM)
      mapInstance.current = map
      markersLayer.current = L.layerGroup().addTo(map)

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      map.on('moveend', () => {
        updatePercorsiForView()
        if (!initialMoveHandled.current) { initialMoveHandled.current = true; return }
        setDirty(true)
      })

      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro

      // Prima ricerca automatica sulla vista di default — dopo, solo su tap esplicito del
      // pulsante "Cerca in quest'area" (pattern Komoot: muovere la mappa non ricerca da sola).
      searchCurrentView()
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

  // Ridisegna i pin ogni volta che cambiano i risultati o i Sentieri filtrati — un solo
  // layerGroup svuotato e ricostruito, più semplice di un diff marker-per-marker per un
  // archivio di queste dimensioni.
  useEffect(() => {
    const L = leafletRef.current
    const layer = markersLayer.current
    if (!L || !layer) return
    layer.clearLayers()

    function pinIcon(color: string, glyph: string) {
      return L!.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">
          <span style="transform:rotate(45deg);font-size:13px;line-height:1">${glyph}</span>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -26],
      })
    }

    // Un colore diverso per ogni singolo percorso (stessa palette/idea di AllRoutesMap.tsx),
    // non un unico verde piatto per la tipologia — con più tracciati/Sentieri vicini altrimenti
    // si sovrappongono senza modo di distinguerli. Un solo indice condiviso fra tracciati da
    // cache e Sentieri salvati, così i due gruppi non ripetono lo stesso colore fra loro.
    let routeColorIdx = 0
    const nextRouteColor = () => ROUTE_COLORS[routeColorIdx++ % ROUTE_COLORS.length]

    // Disegnati per primi: un tracciato reale, non un pin — resta sotto i marker così restano
    // sempre toccabili anche dove una linea ci passa sopra.
    for (const trail of cachedTrails) {
      if (trail.geometry.length < 2) continue
      const color = nextRouteColor()
      const line = L.polyline(trail.geometry, { color, weight: 3.5, opacity: 0.8 })
      const statsLine = [
        trail.distanceKm != null ? `${trail.distanceKm.toFixed(1)} km` : null,
        trail.elevationGain != null ? `+${Math.round(trail.elevationGain)} m` : null,
        trail.difficulty ? `SAC ${trail.difficulty}` : null,
      ].filter(Boolean).join(' · ')
      line.bindPopup(`<div style="min-width:160px">
        <strong style="display:block;font-size:13px;margin-bottom:2px">${escapeHtml(trail.name || 'Sentiero senza nome')}</strong>
        ${statsLine ? `<span style="font-size:11px;color:#666">${escapeHtml(statsLine)}</span>` : ''}
      </div>`)
      line.addTo(layer)
    }

    for (const item of places) {
      const color = META_TYPE_CONFIG[item.metaType].color
      const marker = L.marker([item.latitude, item.longitude], { icon: pinIcon(color, GLYPH[item.metaType]) })
      marker.bindPopup(`<div style="min-width:160px">
        <strong style="display:block;font-size:13px;margin-bottom:4px">${escapeHtml(item.name)}</strong>
        <a href="/mete/${encodeURIComponent(item.id)}" style="display:block;padding:5px 9px;background:${color};color:#fff;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none;text-align:center">Apri →</a>
      </div>`)
      marker.addTo(layer)
    }

    for (const p of percorsi) {
      const color = nextRouteColor()
      const marker = L.marker([p.latitude, p.longitude], { icon: pinIcon(color, GLYPH.sentiero) })
      marker.bindPopup(`<div style="min-width:160px">
        <strong style="display:block;font-size:13px;margin-bottom:4px">${escapeHtml(p.title)}</strong>
        <a href="/guida/${encodeURIComponent(p.id)}" style="display:block;padding:5px 9px;background:${color};color:#fff;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none;text-align:center">Apri →</a>
      </div>`)
      marker.addTo(layer)
    }
  }, [places, percorsi, cachedTrails])

  return (
    <div className="relative rounded-xl overflow-hidden border border-stone-200" style={{ height: '520px' }}>
      <div ref={mapRef} className="w-full h-full" />

      {dirty && (
        <button
          onClick={searchCurrentView}
          disabled={searching}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-stone-800 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg disabled:opacity-70"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Cerca in quest&apos;area
        </button>
      )}

      {zoom < PERCORSI_MIN_ZOOM && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm text-stone-500 text-xs px-3 py-1.5 rounded-full shadow border border-stone-200">
          Avvicinati per vedere anche i Sentieri
        </div>
      )}

      {error && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
    </div>
  )
}
