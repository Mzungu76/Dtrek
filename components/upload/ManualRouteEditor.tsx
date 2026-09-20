'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, RefreshCw, Undo2, Trash2, ArrowLeftRight, ListOrdered, Save,
} from 'lucide-react'
import { META_TYPE_CONFIG, type MetaType } from '@/lib/metaTypes'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import type { TrailNearbyItem } from '@/app/api/trails-nearby/route'
import type { NetworkSegment } from '@/lib/routeBuilder/osmGraph'
import type { PoiItem } from '@/lib/overpass'
import {
  tryAddSegment, splitPolylineAtJunctions, assembleRoutePoints, nearestRouteVertexDistance,
  SNAP_TOLERANCE_M,
} from '@/lib/routeBuilder/manualRouteAssembly'
import { haversineM, computeDirectionArrows } from '@/lib/geoUtils'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'
import { saveResultItemToGuide } from '@/lib/routeBuilder/importResultItem'
import { defaultPendingExpiresAt } from './sharedHelpers'

const ITALY_CENTER: [number, number] = [42.5, 12.5]
const ITALY_ZOOM = 6
// Stessa soglia di CreaGuidaMapSearch.tsx per i Percorsi censiti (TRAILS_MIN_ZOOM).
const TRAILS_MIN_ZOOM = 10
// Più alta: la rete OSM grezza è molto più densa (ogni via, non solo i sentieri con nome) — vedi
// il commento sul tetto di area lato server in app/api/walk-network-segments/route.ts.
const NETWORK_MIN_ZOOM = 14
const SEARCH_LIMIT = 60
const GLYPH: Record<MetaType, string> = { borgo_citta: '🏘️', sito: '🏛️', sentiero: '🥾' }

const ARROW_SPACING_M = 250
const ARROW_ICON_PX = 13
const ARROW_SVG_PX = 10

interface EnrichResult {
  routePolyline: [number, number][]
  trackPoints: { time: string; lat: number; lon: number }[]
  distanceMeters: number
  elevationGain: number
  elevationLoss: number
  altitudeMax: number
  altitudeMin: number
  estimatedTimeSeconds: number
  hasElevation: boolean
  pois: PoiItem[]
}

type SegmentPart = { kind: 'trail' | 'network'; id: string; label: string; points: [number, number][] }
type PinPart = { kind: 'pin'; id: string; label: string; lat: number; lon: number; metaType: MetaType }
type RoutePart = SegmentPart | PinPart

function bboxFromPoints(points: [number, number][], pad: number): [number, number, number, number] {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity
  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
  }
  return [minLat - pad, minLon - pad, maxLat + pad, maxLon + pad]
}

function collectJunctionPoints(segments: NetworkSegment[]): [number, number][] {
  const pts: [number, number][] = []
  for (const seg of segments) {
    if (seg.points.length === 0) continue
    pts.push(seg.points[0])
    pts.push(seg.points[seg.points.length - 1])
  }
  return pts
}

async function fetchJson<T>(url: string, body: unknown, key: string): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
  return data[key] as T
}

/**
 * Creazione interamente manuale di un percorso: PIN (Borgo/Città/Sito), Percorsi censiti (spezzati
 * nei loro sotto-tratti logici, vedi splitPolylineAtJunctions) e rete OSM grezza (già contratta in
 * tratti intersezione-intersezione lato server, vedi buildNetworkSegments) sono tutti cliccabili
 * sulla stessa mappa — l'utente compone il percorso tratto per tratto, senza alcun collegamento
 * automatico dei buchi (tryAddSegment rifiuta un tratto che non tocca un'estremità del percorso in
 * costruzione). Strumento a sé stante, non un terzo modo dentro CreaGuidaMapSearch.tsx — stesso
 * setup Leaflet imperativo di quel file, senza importarne i componenti.
 */
export default function ManualRouteEditor({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const initialMoveHandled = useRef(false)

  const [zoom, setZoom] = useState(ITALY_ZOOM)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [metaResults, setMetaResults] = useState<MetaSearchResultItem[]>([])
  const [trailResults, setTrailResults] = useState<TrailNearbyItem[]>([])
  const [networkSegments, setNetworkSegments] = useState<NetworkSegment[]>([])

  const [parts, setParts] = useState<RoutePart[]>([])
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)

  const [title, setTitle] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [preview, setPreview] = useState<EnrichResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Il messaggio di rifiuto (tratto non toccante) è transitorio — sparisce da solo, come un toast,
  // invece di restare finché l'utente non tocca qualcos'altro.
  useEffect(() => {
    if (!selectionError) return
    const t = setTimeout(() => setSelectionError(null), 4000)
    return () => clearTimeout(t)
  }, [selectionError])

  const segmentParts = useMemo(() => parts.filter((p): p is SegmentPart => p.kind !== 'pin'), [parts])
  const usedSegmentIds = useMemo(() => new Set(segmentParts.map(p => p.id)), [segmentParts])
  const routePoints = useMemo(() => assembleRoutePoints(segmentParts.map(p => p.points)), [segmentParts])
  const pinParts = useMemo(() => {
    const pins = parts.filter((p): p is PinPart => p.kind === 'pin')
    return pins
      .map(p => ({ ...p, dist: nearestRouteVertexDistance(routePoints, p.lat, p.lon) }))
      .sort((a, b) => a.dist - b.dist)
  }, [parts, routePoints])

  const totalDistanceM = useMemo(() => {
    let d = 0
    for (let i = 1; i < routePoints.length; i++) {
      d += haversineM(routePoints[i - 1][0], routePoints[i - 1][1], routePoints[i][0], routePoints[i][1])
    }
    return d
  }, [routePoints])

  // Ogni Percorso censito spezzato nei suoi sotto-tratti (fino al prossimo incrocio, riusando le
  // giunzioni della rete OSM grezza della stessa viewport quando disponibili) — mai selezionabile
  // come un solo tratto indivisibile: senza nessuna giunzione nota (layer Sentieri non ancora
  // caricato, zoom troppo basso, o il Percorso non ne incrocia nessuna) il ripiego spezza comunque
  // sui vertici propri della sua spezzata (vedi lib/routeBuilder/manualRouteAssembly.ts).
  const trailSubSegments = useMemo(() => {
    const junctions = collectJunctionPoints(networkSegments)
    const out: { id: string; trailId: number; trailName: string; points: [number, number][] }[] = []
    for (const trail of trailResults) {
      if (trail.geometry.length < 2) continue
      const subs = splitPolylineAtJunctions(trail.geometry, junctions)
      subs.forEach((pts, i) => out.push({ id: `trail:${trail.id}:${i}`, trailId: trail.id, trailName: trail.name, points: pts }))
    }
    return out
  }, [trailResults, networkSegments])

  async function searchCurrentView() {
    const map = mapInstance.current
    if (!map) return
    setLoading(true)
    setLoadError(null)
    try {
      const bounds = map.getBounds()
      const center = bounds.getCenter()
      const radiusKm = center.distanceTo(bounds.getNorthEast()) / 1000
      const origin = { lat: center.lat, lon: center.lng }
      const bbox: [number, number, number, number] = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      const z = map.getZoom()

      // Un fallimento (es. Overpass momentaneamente irraggiungibile per la rete grezza, la
      // sorgente più fragile delle tre) non deve azzerare gli altri due layer — ognuno fallisce per
      // conto suo (ripiega su [] e segna il proprio nome), non un solo Promise.all che con un
      // singolo rifiuto avrebbe lasciato la mappa senza NESSUN elemento disegnato, PIN inclusi.
      const failed: string[] = []
      const safely = <T,>(label: string, p: Promise<T[]>): Promise<T[]> =>
        p.catch(e => { failed.push(label); console.warn(`[ManualRouteEditor] ${label}:`, e); return [] })

      const [borghi, siti, trails, network] = await Promise.all([
        safely('Borghi/Città', fetchJson<MetaSearchResultItem[]>('/api/meta-search', { metaType: 'borgo_citta', origin, maxDistanceKm: radiusKm, limit: SEARCH_LIMIT }, 'items')),
        safely('Siti', fetchJson<MetaSearchResultItem[]>('/api/meta-search', { metaType: 'sito', origin, maxDistanceKm: radiusKm, limit: SEARCH_LIMIT }, 'items')),
        z >= TRAILS_MIN_ZOOM
          ? safely('Percorsi', fetchJson<TrailNearbyItem[]>('/api/trails-nearby', { lat: origin.lat, lon: origin.lon, radiusKm }, 'items'))
          : Promise.resolve([]),
        z >= NETWORK_MIN_ZOOM
          ? safely('Sentieri', fetchJson<NetworkSegment[]>('/api/walk-network-segments', { bbox }, 'segments'))
          : Promise.resolve([]),
      ])

      setMetaResults([...borghi, ...siti])
      setTrailResults(trails)
      setNetworkSegments(network)
      setDirty(false)
      if (failed.length > 0) {
        setLoadError(`${failed.join(', ')}: caricamento non riuscito in quest'area — gli altri elementi restano comunque selezionabili.`)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Caricamento non riuscito')
    } finally {
      setLoading(false)
    }
  }

  // Mappa Leaflet — stesso setup di CreaGuidaMapSearch.tsx (tile proxy, zoomControl:false).
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return
      leafletRef.current = L

      delete (L.Icon.Default.prototype as any)._getIconUrl
      const map = L.map(mapRef.current!, { zoomControl: false }).setView(ITALY_CENTER, ITALY_ZOOM)
      mapInstance.current = map
      layerRef.current = L.layerGroup().addTo(map)

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      map.on('moveend', () => {
        setZoom(map.getZoom())
        if (!initialMoveHandled.current) { initialMoveHandled.current = true; return }
        setDirty(true)
      })

      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro

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

  function handleSegmentClick(kind: 'trail' | 'network', id: string, label: string, points: [number, number][]) {
    if (usedSegmentIds.has(id)) return
    const result = tryAddSegment(routePoints, points, SNAP_TOLERANCE_M)
    if (!result.ok || !result.orientedPoints) {
      setSelectionError(result.reason ?? 'Tratto non valido.')
      return
    }
    setSelectionError(null)
    const newPart: SegmentPart = { kind, id, label, points: result.orientedPoints }
    setParts(prev => (result.attachedAt === 'start' ? [newPart, ...prev] : [...prev, newPart]))
    // La geometria è cambiata — un'anteprima già calcolata (dislivello/tempo/POI) non è più valida
    // per il percorso attuale, altrimenti "Salva" userebbe numeri di un percorso più corto.
    setPreview(null)
  }

  function togglePin(item: MetaSearchResultItem) {
    setParts(prev => {
      const exists = prev.some(p => p.kind === 'pin' && p.id === item.id)
      if (exists) return prev.filter(p => !(p.kind === 'pin' && p.id === item.id))
      const pin: PinPart = { kind: 'pin', id: item.id, label: item.name, lat: item.latitude, lon: item.longitude, metaType: item.metaType }
      return [...prev, pin]
    })
  }

  // La costruzione è solo per accodamento/prependimento (mai un inserimento "di mezzo") — la
  // rimozione resta simmetrica: solo dai due capi, mai da un tratto interno (spezzerebbe la catena
  // senza un'operazione ben definita).
  function removeSegmentAt(end: 'start' | 'end') {
    if (segmentParts.length === 0) return
    const target = end === 'start' ? segmentParts[0] : segmentParts[segmentParts.length - 1]
    setParts(prev => prev.filter(p => p.id !== target.id))
    setPreview(null)
  }

  function removePin(id: string) {
    setParts(prev => prev.filter(p => !(p.kind === 'pin' && p.id === id)))
  }

  function invertDirection() {
    setParts(prev => {
      const segs = prev.filter((p): p is SegmentPart => p.kind !== 'pin')
      const pins = prev.filter(p => p.kind === 'pin')
      const reversedSegs = [...segs].reverse().map(s => ({ ...s, points: [...s.points].reverse() }))
      return [...reversedSegs, ...pins]
    })
    setPreview(null)
  }

  function clearAll() {
    setParts([])
    setPreview(null)
    setPreviewError(null)
    setSelectionError(null)
  }

  async function handlePreview() {
    if (routePoints.length < 2) return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const bbox = bboxFromPoints(routePoints, 0.02)
      const res = await fetch('/api/route-build/multi-stop/step/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routePolyline: routePoints, distanceM: totalDistanceM, targetDistanceKm: null, bbox }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
      setPreview(data as EnrichResult)
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Calcolo non riuscito')
    } finally {
      setPreviewing(false)
    }
  }

  function routeDescription(): string {
    if (pinParts.length > 0) return pinParts.map(p => p.label).join(' → ')
    const trailNames = Array.from(new Set(segmentParts.filter(p => p.kind === 'trail').map(p => p.label)))
    return trailNames.length > 0 ? trailNames.join(' → ') : 'Percorso creato manualmente'
  }

  async function handleSave() {
    if (routePoints.length < 2) return
    setSaving(true)
    setSaveError(null)
    try {
      let enriched = preview
      if (!enriched) {
        const bbox = bboxFromPoints(routePoints, 0.02)
        const res = await fetch('/api/route-build/multi-stop/step/enrich', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routePolyline: routePoints, distanceM: totalDistanceM, targetDistanceKm: null, bbox }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
        enriched = data as EnrichResult
      }
      const name = title.trim() || (pinParts[0]?.label ? `${pinParts[0].label} — percorso manuale` : 'Percorso manuale')
      const found: FoundRouteItem = {
        name,
        description: routeDescription(),
        track: {
          trackPoints: enriched.trackPoints ?? [],
          routePolyline: enriched.routePolyline ?? routePoints,
          distanceMeters: enriched.distanceMeters ?? totalDistanceM,
          elevationGain: enriched.elevationGain ?? 0,
          elevationLoss: enriched.elevationLoss ?? 0,
          altitudeMax: enriched.altitudeMax ?? 0,
          altitudeMin: enriched.altitudeMin ?? 0,
          estimatedTimeSeconds: enriched.estimatedTimeSeconds ?? Math.round(totalDistanceM / 1.2),
          hasElevation: enriched.hasElevation ?? false,
        },
        pois: enriched.pois ?? [],
      }
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const hike = await saveResultItemToGuide({ kind: 'found', data: found }, name, '', pendingExpiresAt)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Errore nel salvataggio, riprova.')
      setSaving(false)
    }
  }

  // Ridisegno completo a ogni cambio di dati/percorso — stesso pattern (un solo layerGroup svuotato
  // e ricostruito) di CreaGuidaMapSearch.tsx, qui con più livelli: rete grezza e Percorsi censiti
  // sotto, il percorso assemblato con le frecce di direzione sopra, i PIN in cima a tutto.
  useEffect(() => {
    const L = leafletRef.current
    const layer = layerRef.current
    if (!L || !layer) return
    layer.clearLayers()

    function pinIcon(color: string, glyph: string, opts?: { dimmed?: boolean; badge?: number }) {
      const size = opts?.badge != null ? 34 : 26
      const opacity = opts?.dimmed ? 0.4 : 1
      const badgeHtml = opts?.badge != null
        ? `<div style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background:#1c1917;border:1.5px solid white;color:white;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;transform:rotate(45deg)">${opts.badge}</div>`
        : ''
      return L!.divIcon({
        className: '',
        html: `<div style="position:relative;opacity:${opacity}">
          <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">
            <span style="transform:rotate(45deg);font-size:${opts?.badge != null ? 15 : 12}px;line-height:1">${glyph}</span>
          </div>
          ${badgeHtml}
        </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      })
    }

    // 1) Rete OSM grezza — tratti sottili grigi, evidenziati in arancio quando già nel percorso.
    for (const seg of networkSegments) {
      if (seg.points.length < 2) continue
      const used = usedSegmentIds.has(seg.id)
      const line = L.polyline(seg.points, { color: used ? '#ea580c' : '#94a3b8', weight: used ? 5 : 3, opacity: used ? 1 : 0.55 })
      if (!used) line.on('click', () => handleSegmentClick('network', seg.id, `Sentiero (${seg.highway ?? 'via'})`, seg.points))
      line.addTo(layer)
    }

    // 2) Percorsi censiti, spezzati nei loro sotto-tratti — un colore per Percorso (ciclico), più
    // acceso quando già nel percorso.
    const trailColorIdx = new Map<number, number>()
    let nextColorIdx = 0
    const TRAIL_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#16a34a']
    for (const sub of trailSubSegments) {
      if (sub.points.length < 2) continue
      if (!trailColorIdx.has(sub.trailId)) trailColorIdx.set(sub.trailId, nextColorIdx++ % TRAIL_COLORS.length)
      const color = TRAIL_COLORS[trailColorIdx.get(sub.trailId)!]
      const used = usedSegmentIds.has(sub.id)
      const line = L.polyline(sub.points, { color: used ? '#ea580c' : color, weight: used ? 5.5 : 4, opacity: used ? 1 : 0.75 })
      if (!used) line.on('click', () => handleSegmentClick('trail', sub.id, sub.trailName, sub.points))
      line.addTo(layer)
    }

    // 3) Il percorso assemblato, in evidenza sopra tutto — doppia linea (fascia bianca sotto) più le
    // frecce di direzione (stesso pattern di components/video/RouteLeafletEditor.tsx), così
    // "Inverti direzione" ha un riscontro visivo immediato.
    if (routePoints.length >= 2) {
      L.polyline(routePoints, { color: '#ffffff', weight: 9, opacity: 0.85 }).addTo(layer)
      L.polyline(routePoints, { color: '#1c1917', weight: 5, opacity: 1 }).addTo(layer)
      for (const arrow of computeDirectionArrows(routePoints, ARROW_SPACING_M)) {
        const icon = L.divIcon({
          html: `<div style="transform:rotate(${arrow.bearing}deg);width:${ARROW_ICON_PX}px;height:${ARROW_ICON_PX}px;display:flex;align-items:center;justify-content:center">
                   <svg width="${ARROW_SVG_PX}" height="${ARROW_SVG_PX}" viewBox="0 0 24 24" fill="#1c1917" stroke="#ffffff" stroke-width="2.5"><path d="M12 2 L20 20 L12 15 L4 20 Z"/></svg>
                 </div>`,
          iconSize: [ARROW_ICON_PX, ARROW_ICON_PX], iconAnchor: [ARROW_ICON_PX / 2, ARROW_ICON_PX / 2], className: '',
        })
        L.marker([arrow.lat, arrow.lon], { icon, interactive: false, keyboard: false }).addTo(layer)
      }
    }

    // 4) PIN — sopra tutto, badge numerato in base alla posizione lungo il percorso per quelli già
    // inclusi, altrimenti solo dimmed/selezionabili.
    for (const item of metaResults) {
      const color = META_TYPE_CONFIG[item.metaType].color
      const badge = pinParts.findIndex(p => p.id === item.id)
      const icon = badge >= 0
        ? pinIcon(color, GLYPH[item.metaType], { badge: badge + 1 })
        : pinIcon(color, GLYPH[item.metaType], { dimmed: true })
      const marker = L.marker([item.latitude, item.longitude], { icon })
      marker.on('click', () => togglePin(item))
      marker.addTo(layer)
    }
    // handleSegmentClick non è nelle dep: già ricreata ad ogni render a partire da routePoints/
    // usedSegmentIds, entrambe già qui sotto — includerla aggiungerebbe solo rumore, mai un valore
    // mancante realmente diverso da quelli già tracciati.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaResults, trailSubSegments, networkSegments, routePoints, usedSegmentIds, pinParts])

  const showTrailsZoomHint = zoom < TRAILS_MIN_ZOOM
  const showNetworkZoomHint = zoom >= TRAILS_MIN_ZOOM && zoom < NETWORK_MIN_ZOOM
  const canFinalize = routePoints.length >= 2

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-stone-100">
      <div className="absolute inset-0 isolate">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="absolute left-0 right-0 top-0 z-10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Indietro"
            className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 bg-white/95 backdrop-blur rounded-2xl shadow-md px-3.5 py-2.5 min-w-0">
            <p className="text-sm font-semibold text-stone-800">Crea un percorso a mano</p>
            <p className="text-[11px] text-stone-500">Tocca i tratti sulla mappa per unirli</p>
          </div>
        </div>
        {loadError && (
          <p className="text-center text-[11px] font-medium text-red-600 bg-white/95 backdrop-blur rounded-full py-1.5 px-3 mx-auto w-fit shadow-sm">
            {loadError}
          </p>
        )}
      </div>

      {dirty && (
        <div className="absolute left-0 right-0 top-[76px] z-10 flex justify-center">
          <button onClick={searchCurrentView} disabled={loading}
            className="flex items-center gap-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg disabled:opacity-70 transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Cerca in quest&apos;area
          </button>
        </div>
      )}

      {(showTrailsZoomHint || showNetworkZoomHint) && (
        <div className="absolute left-0 right-0 z-10 flex justify-center" style={{ top: dirty ? '122px' : '76px' }}>
          <p className="bg-white/90 backdrop-blur text-stone-500 text-[11px] px-3 py-1.5 rounded-full shadow border border-stone-200">
            {showTrailsZoomHint ? 'Avvicinati per vedere anche i Percorsi e i Sentieri' : 'Avvicinati ancora per vedere anche i Sentieri (rete OSM)'}
          </p>
        </div>
      )}

      {selectionError && (
        <div className="absolute left-3 right-3 z-20 flex justify-center" style={{ top: '76px' }}>
          <p className="bg-red-600/95 backdrop-blur text-white text-xs font-medium px-3.5 py-2 rounded-full shadow-md text-center max-w-sm">
            {selectionError}
          </p>
        </div>
      )}

      {/* ── Toolbar dell'editor ──────────────────────────────────────────── */}
      <div className="absolute left-3 right-3 z-10 bg-white rounded-2xl shadow-lg p-3 space-y-2.5" style={{ bottom: '12px' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-800">
              {(totalDistanceM / 1000).toFixed(1)} km
              {preview?.hasElevation && <span className="text-stone-400 font-normal"> · +{Math.round(preview.elevationGain)}m</span>}
            </p>
            <p className="text-[11px] text-stone-500">
              {segmentParts.length} tratt{segmentParts.length === 1 ? 'o' : 'i'}
              {pinParts.length > 0 && ` · ${pinParts.length} tapp${pinParts.length === 1 ? 'a' : 'e'}`}
            </p>
          </div>
          <button onClick={() => setShowList(v => !v)} disabled={parts.length === 0}
            className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 transition-colors disabled:opacity-40 shrink-0">
            <ListOrdered className="w-4 h-4" />
          </button>
        </div>

        {showList && parts.length > 0 && (
          <ol className="space-y-1.5 max-h-40 overflow-y-auto border-t border-stone-100 pt-2">
            {segmentParts.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 min-w-0 text-stone-700">
                  <span className="w-5 h-5 rounded-full bg-stone-800 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                  <span className="truncate">{p.label}</span>
                </span>
                {(i === 0 || i === segmentParts.length - 1) && (
                  <button onClick={() => removeSegmentAt(i === 0 ? 'start' : 'end')} className="text-red-600 font-semibold shrink-0">Rimuovi</button>
                )}
              </li>
            ))}
            {pinParts.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 min-w-0 text-stone-700">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0" style={{ background: META_TYPE_CONFIG[p.metaType].color }}>{GLYPH[p.metaType]}</span>
                  <span className="truncate">{i + 1}. {p.label}</span>
                </span>
                <button onClick={() => removePin(p.id)} className="text-red-600 font-semibold shrink-0">Rimuovi</button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex items-center gap-1.5">
          <button onClick={() => removeSegmentAt('end')} disabled={segmentParts.length === 0}
            title="Rimuovi l'ultimo tratto" aria-label="Rimuovi l'ultimo tratto"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-40">
            <Undo2 className="w-3.5 h-3.5" /> Annulla
          </button>
          <button onClick={invertDirection} disabled={segmentParts.length === 0}
            title="Inverti direzione" aria-label="Inverti direzione"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-40">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Inverti
          </button>
          <button onClick={clearAll} disabled={parts.length === 0}
            title="Svuota percorso" aria-label="Svuota percorso"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5" /> Svuota
          </button>
        </div>

        {canFinalize && (
          <div className="space-y-2 border-t border-stone-100 pt-2.5">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nome del percorso…"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400"
            />
            {previewError && <p className="text-[11px] text-red-600">{previewError}</p>}
            {saveError && <p className="text-[11px] text-red-600">{saveError}</p>}
            <div className="flex items-center gap-1.5">
              <button onClick={handlePreview} disabled={previewing || saving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors disabled:opacity-60">
                {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Calcola dislivello e tempo
              </button>
              <button onClick={handleSave} disabled={saving || previewing}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 text-white text-xs font-bold transition-colors disabled:opacity-60">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salva come guida
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
