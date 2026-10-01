'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, RefreshCw, Undo2, Trash2, ArrowLeftRight, ListOrdered, Save,
  Search as SearchIcon, Route as RouteIcon, Upload,
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
import { defaultPendingExpiresAt, type MapView } from './sharedHelpers'

const ITALY_CENTER: [number, number] = [42.5, 12.5]
const ITALY_ZOOM = 6
// Stessa soglia di CreaGuidaMapSearch.tsx per i Percorsi censiti (TRAILS_MIN_ZOOM).
const TRAILS_MIN_ZOOM = 10
// Più alta: la rete OSM grezza è molto più densa (ogni via, non solo i sentieri con nome) — vedi
// il commento sul tetto di area lato server in app/api/walk-network-segments/route.ts.
const NETWORK_MIN_ZOOM = 14
const SEARCH_LIMIT = 60
const GLYPH: Record<MetaType, string> = { borgo_citta: '🏘️', sito: '🏛️', sentiero: '🥾', cammino: '🧭' }

const ARROW_SPACING_M = 250
const ARROW_ICON_PX = 13
const ARROW_SVG_PX = 10

// La rete grezza (Sentieri) è la sorgente pesante — un raggio fisso e piccolo, indipendente da
// quanto è largo il rettangolo visibile (che a parità di zoom può variare molto con la finestra),
// invece dell'intero viewport: meno dati da scaricare, disegnare e mandare a Overpass (query più
// piccole = meno probabilità di timeout — la causa dei fallimenti osservati in produzione col
// vecchio approccio "tutto il viewport", vedi il commento su MAX_AREA_KM2 nell'endpoint).
const NETWORK_FETCH_RADIUS_M = 900
// Allineata alla stessa granularità di normalizeBboxKey (lib/geoUtils.ts, ~1.1km) usata lato
// server per la cache Overpass — un pan che resta nella stessa cella non genera una nuova
// richiesta: né verso il nostro endpoint né, quando serve, verso Overpass.
const NETWORK_GRID_DEG = 0.01
// I Percorsi censiti (tabella `trails`, query sul nostro DB — non Overpass, nessun rischio di
// timeout come per la rete grezza sopra) vengono richiesti per un'area più ampia di quella
// strettamente visibile, e riusati finché la viewport corrente rientra per intero in quella già
// coperta (vedi lastTrailsFetchRef sotto) — un pan piccolo dentro l'area già scaricata non genera
// una nuova richiesta né un ricalcolo, invece di rifare la stessa ricerca a ogni spostamento.
const TRAILS_FETCH_PAD = 1.6
// Debounce del ricaricamento automatico dopo che la mappa si ferma — sostituisce il vecchio
// bottone "Cerca in quest'area": comodo per una ricerca una tantum, scomodo per un editor dove ci
// si sposta in continuazione componendo un percorso.
const AUTO_SEARCH_DEBOUNCE_MS = 600
// Fascia invisibile più larga sopra ogni tratto cliccabile, per un bersaglio tollerante al tocco
// (soprattutto da mobile) — la linea visibile resta sottile, solo l'area di hit-test è più larga.
const CLICK_HITBOX_EXTRA_PX = 16

function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid
}

function bboxFromCenterRadius(lat: number, lon: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_000
  const dLon = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180))
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon]
}

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
export default function ManualRouteEditor({ onBack, initialView, onViewChange, onOpenPanel }: {
  onBack: () => void
  /** Centro/zoom di partenza (vedi sharedHelpers.ts's MapView, sollevato in app/upload/page.tsx) —
   *  se assente riparte da ITALY_CENTER/ITALY_ZOOM come prima. */
  initialView?: MapView
  /** Richiamato a ogni 'moveend' col centro/zoom corrente, così tornando a CreaGuidaMapSearch la
   *  mappa riparte da qui invece che dal centro Italia. */
  onViewChange?: (view: MapView) => void
  /** Rail (vedi sotto) "Genera"/"Porta i tuoi dati": questo editor non ha una propria copia di quei
   *  fogli (vivono in CreaGuidaMapSearch.tsx), quindi torna lì con quel foglio già aperto invece di
   *  duplicarne la lista qui. */
  onOpenPanel?: (panel: 'genera' | 'importa') => void
}) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const initialMoveHandled = useRef(false)
  // Stesso motivo di searchCurrentViewRef sotto: il listener 'moveend' è registrato una sola volta
  // al mount, questo ref evita che richiuda sulla prop onViewChange del primo render.
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange
  // Cella di griglia (vedi NETWORK_GRID_DEG) dell'ultimo fetch Sentieri riuscito — un pan che
  // resta nella stessa cella salta del tutto la richiesta, non solo lato cache server.
  const lastNetworkGridKeyRef = useRef<string | null>(null)
  // Centro/raggio (km) dell'ultimo fetch Percorsi riuscito — vedi TRAILS_FETCH_PAD sopra: a
  // differenza della rete grezza il raggio non è fisso (segue lo zoom), quindi qui il riuso è "il
  // cerchio della viewport corrente rientra per intero in quello già coperto", non una cella fissa.
  const lastTrailsFetchRef = useRef<{ lat: number; lon: number; radiusKm: number } | null>(null)
  const autoSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Il listener 'moveend' è registrato una sola volta (effetto di mount) — richiamare tramite
  // questo ref, aggiornato ad ogni render, invece della funzione catturata al mount, evita di
  // richiudere su stato ormai vecchio (networkSegments su tutti: il riuso "stessa cella" sotto
  // altrimenti vedrebbe sempre l'array vuoto iniziale, mai gli ultimi dati caricati).
  const searchCurrentViewRef = useRef<() => void>(() => {})

  const [zoom, setZoom] = useState(ITALY_ZOOM)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [metaResults, setMetaResults] = useState<MetaSearchResultItem[]>([])
  const [trailResults, setTrailResults] = useState<TrailNearbyItem[]>([])
  const [networkSegments, setNetworkSegments] = useState<NetworkSegment[]>([])

  const [parts, setParts] = useState<RoutePart[]>([])
  const [selectionError, setSelectionError] = useState<string | null>(null)
  // Id del tratto appena cliccato e rifiutato (non tocca il percorso) — lampeggia brevemente in
  // rosso sulla mappa così è chiaro QUALE tratto ha ricevuto il click, non solo che uno è stato
  // rifiutato: senza questo, un click "sembra non fare nulla" quando in realtà è stato registrato
  // ma scartato, la stessa confusione segnalata sull'affidabilità del tocco.
  const [flashRejectedId, setFlashRejectedId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!flashRejectedId) return
    const t = setTimeout(() => setFlashRejectedId(null), 1100)
    return () => clearTimeout(t)
  }, [flashRejectedId])

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
      const z = map.getZoom()

      // Un fallimento (es. Overpass momentaneamente irraggiungibile per la rete grezza, la
      // sorgente più fragile delle quattro) non deve azzerare gli altri layer — ognuno fallisce per
      // conto suo (ripiega su [] e segna il proprio nome), non un solo Promise.all che con un
      // singolo rifiuto avrebbe lasciato la mappa senza NESSUN elemento disegnato, PIN inclusi.
      const layer = async <T,>(label: string, p: Promise<T[]>): Promise<{ label: string; items: T[]; ok: boolean }> => {
        try { return { label, items: await p, ok: true } }
        catch (e) { console.warn(`[ManualRouteEditor] ${label}:`, e); return { label, items: [], ok: false } }
      }

      // Rete grezza: raggio fisso allineato a una griglia invece dell'intero rettangolo visibile
      // (vedi NETWORK_FETCH_RADIUS_M/NETWORK_GRID_DEG sopra) — se il pan corrente ricade ancora
      // nella stessa cella dell'ultimo fetch riuscito, nessuna nuova richiesta: il layer resta
      // quello già in stato, senza nemmeno un giro di rete verso il nostro endpoint.
      let networkGridKey: string | null = null
      let networkResultPromise: Promise<{ label: string; items: NetworkSegment[]; ok: boolean }>
      if (z < NETWORK_MIN_ZOOM) {
        lastNetworkGridKeyRef.current = null
        networkResultPromise = Promise.resolve({ label: 'Sentieri', items: [], ok: true })
      } else {
        const gLat = snapToGrid(center.lat, NETWORK_GRID_DEG)
        const gLon = snapToGrid(center.lng, NETWORK_GRID_DEG)
        networkGridKey = `${gLat.toFixed(4)},${gLon.toFixed(4)}`
        if (networkGridKey === lastNetworkGridKeyRef.current) {
          networkResultPromise = Promise.resolve({ label: 'Sentieri', items: networkSegments, ok: true })
        } else {
          const networkBbox = bboxFromCenterRadius(gLat, gLon, NETWORK_FETCH_RADIUS_M)
          networkResultPromise = layer('Sentieri', fetchJson<NetworkSegment[]>('/api/walk-network-segments', { bbox: networkBbox }, 'segments'))
        }
      }

      // Percorsi censiti: stesso principio della rete grezza sopra (salta la richiesta se l'area
      // corrente è già coperta) ma senza una griglia a celle fisse, perché qui il raggio segue lo
      // zoom invece di essere fisso — "coperta" vuol dire che il cerchio (centro, raggio) della
      // viewport corrente rientra per intero in quello dell'ultimo fetch riuscito. Quando serve
      // comunque un fetch, la richiesta copre un'area più ampia di quella visibile (TRAILS_FETCH_PAD)
      // così i prossimi pan piccoli restano coperti senza un nuovo giro di rete.
      let trailsResultPromise: Promise<{ label: string; items: TrailNearbyItem[]; ok: boolean }>
      if (z < TRAILS_MIN_ZOOM) {
        lastTrailsFetchRef.current = null
        trailsResultPromise = Promise.resolve({ label: 'Percorsi', items: [], ok: true })
      } else {
        const last = lastTrailsFetchRef.current
        const coveredByLastFetch = last != null
          && haversineM(last.lat, last.lon, origin.lat, origin.lon) + radiusKm * 1000 <= last.radiusKm * 1000
        if (coveredByLastFetch) {
          trailsResultPromise = Promise.resolve({ label: 'Percorsi', items: trailResults, ok: true })
        } else {
          const fetchRadiusKm = radiusKm * TRAILS_FETCH_PAD
          trailsResultPromise = layer('Percorsi', fetchJson<TrailNearbyItem[]>('/api/trails-nearby', { lat: origin.lat, lon: origin.lon, radiusKm: fetchRadiusKm }, 'items'))
            .then(r => {
              // Solo su un fetch riuscito — un fallimento non deve "bloccare" quella zona come già
              // coperta, altrimenti un prossimo giro non ritenterebbe mai.
              if (r.ok) lastTrailsFetchRef.current = { lat: origin.lat, lon: origin.lon, radiusKm: fetchRadiusKm }
              return r
            })
        }
      }

      const [borghi, siti, trails, network] = await Promise.all([
        layer('Borghi/Città', fetchJson<MetaSearchResultItem[]>('/api/meta-search', { metaType: 'borgo_citta', origin, maxDistanceKm: radiusKm, limit: SEARCH_LIMIT }, 'items')),
        layer('Siti', fetchJson<MetaSearchResultItem[]>('/api/meta-search', { metaType: 'sito', origin, maxDistanceKm: radiusKm, limit: SEARCH_LIMIT }, 'items')),
        trailsResultPromise,
        networkResultPromise,
      ])

      setMetaResults([...borghi.items, ...siti.items])
      setTrailResults(trails.items)
      setNetworkSegments(network.items)
      // Solo su un fetch riuscito (o riusato dalla stessa cella) — un fallimento non deve
      // "bloccare" quella zona come già coperta, altrimenti un prossimo giro non ritenterebbe mai.
      if (network.ok && networkGridKey) lastNetworkGridKeyRef.current = networkGridKey

      const failedLabels = [borghi, siti, trails, network].filter(r => !r.ok).map(r => r.label)
      if (failedLabels.length > 0) {
        setLoadError(`${failedLabels.join(', ')}: caricamento non riuscito in quest'area — gli altri elementi restano comunque selezionabili.`)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Caricamento non riuscito')
    } finally {
      setLoading(false)
    }
  }
  searchCurrentViewRef.current = searchCurrentView

  // Mappa Leaflet — stesso setup di CreaGuidaMapSearch.tsx (tile proxy, zoomControl:false).
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return
      leafletRef.current = L

      delete (L.Icon.Default.prototype as any)._getIconUrl
      // renderer: L.canvas() — di default Leaflet disegna ogni polilinea come un elemento SVG a sé;
      // con centinaia di tratti Sentieri/Percorsi visibili insieme (anche dopo aver ridotto l'area
      // richiesta, vedi NETWORK_FETCH_RADIUS_M sopra) il canvas resta molto più scattante da
      // disegnare e ridisegnare a ogni click. Il click-detection di Leaflet funziona identico sul
      // canvas (hit-test manuale interno, non richiede nulla in più qui).
      const map = L.map(mapRef.current!, { zoomControl: false, renderer: L.canvas() })
        .setView(initialView ? [initialView.lat, initialView.lon] : ITALY_CENTER, initialView?.zoom ?? ITALY_ZOOM)
      mapInstance.current = map
      layerRef.current = L.layerGroup().addTo(map)

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      // Ricaricamento automatico e con debounce vero (il timer si riarma a ogni 'moveend', non solo
      // al primo) invece del vecchio bottone "Cerca in quest'area" — comodo per una ricerca una
      // tantum, scomodo per un editor dove ci si sposta in continuazione componendo un percorso.
      // Richiama tramite searchCurrentViewRef (sempre la versione più recente, vedi la sua
      // dichiarazione) perché questo listener è registrato una sola volta qui al mount.
      map.on('moveend', () => {
        setZoom(map.getZoom())
        const c = map.getCenter()
        onViewChangeRef.current?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
        if (!initialMoveHandled.current) { initialMoveHandled.current = true; return }
        if (autoSearchTimerRef.current) clearTimeout(autoSearchTimerRef.current)
        autoSearchTimerRef.current = setTimeout(() => { searchCurrentViewRef.current() }, AUTO_SEARCH_DEBOUNCE_MS)
      })

      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro

      searchCurrentView()
    })

    return () => {
      if (autoSearchTimerRef.current) clearTimeout(autoSearchTimerRef.current)
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
    // Tolleranza più larga quando il tratto in coda/testa al percorso viene da una fonte diversa
    // (Percorso censito ↔ rete OSM grezza) — vedi CROSS_SOURCE_SNAP_TOLERANCE_M in
    // manualRouteAssembly.ts: le due fonti non condividono nodi esatti, un cambio di tipologia
    // realmente continuo sul terreno non deve essere scartato solo per questo.
    const result = tryAddSegment(routePoints, points, SNAP_TOLERANCE_M, {
      routeStartKind: segmentParts[0]?.kind,
      routeEndKind: segmentParts[segmentParts.length - 1]?.kind,
      newKind: kind,
    })
    if (!result.ok || !result.orientedPoints) {
      setSelectionError(result.reason ?? 'Tratto non valido.')
      setFlashRejectedId(id)
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

    // Un tratto cliccabile è disegnato come DUE polilinee: quella visibile (sottile, sempre
    // interactive:false) e una seconda invisibile più larga sopra di essa che porta davvero il
    // click — un bersaglio più tollerante al tocco (soprattutto da mobile) senza allargare la
    // linea a schermo. interactive:false sulla visibile evita anche che "rubi" il click a un
    // tratto sottostante quando due linee si sovrappongono: prima di questo fix un tratto Path di
    // Leaflet restava cliccabile (e quindi bloccava i click sotto di sé) anche senza nessun
    // handler attaccato, il bug più probabile dietro "a volte il click non fa nulla".
    function addClickableLine(points: [number, number][], color: string, weight: number, opacity: number, onClick: (() => void) | null) {
      L!.polyline(points, { color, weight, opacity, interactive: false }).addTo(layer!)
      if (onClick) {
        L!.polyline(points, { color: '#000000', weight: weight + CLICK_HITBOX_EXTRA_PX, opacity: 0 })
          .on('click', onClick)
          .addTo(layer!)
      }
    }

    // 1) Rete OSM grezza — tratti sottili grigi, evidenziati in arancio quando già nel percorso, in
    // rosso un istante quando appena rifiutati (vedi flashRejectedId).
    for (const seg of networkSegments) {
      if (seg.points.length < 2) continue
      const used = usedSegmentIds.has(seg.id)
      const flashing = !used && flashRejectedId === seg.id
      const color = used ? '#ea580c' : flashing ? '#dc2626' : '#94a3b8'
      addClickableLine(seg.points, color, used ? 5 : flashing ? 5 : 3, used ? 1 : 0.55,
        used ? null : () => handleSegmentClick('network', seg.id, `Sentiero (${seg.highway ?? 'via'})`, seg.points))
    }

    // 2) Percorsi censiti, spezzati nei loro sotto-tratti — un colore per Percorso (ciclico), più
    // acceso quando già nel percorso.
    const trailColorIdx = new Map<number, number>()
    let nextColorIdx = 0
    const TRAIL_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#16a34a']
    for (const sub of trailSubSegments) {
      if (sub.points.length < 2) continue
      if (!trailColorIdx.has(sub.trailId)) trailColorIdx.set(sub.trailId, nextColorIdx++ % TRAIL_COLORS.length)
      const baseColor = TRAIL_COLORS[trailColorIdx.get(sub.trailId)!]
      const used = usedSegmentIds.has(sub.id)
      const flashing = !used && flashRejectedId === sub.id
      const color = used ? '#ea580c' : flashing ? '#dc2626' : baseColor
      addClickableLine(sub.points, color, used ? 5.5 : flashing ? 5.5 : 4, used ? 1 : 0.75,
        used ? null : () => handleSegmentClick('trail', sub.id, sub.trailName, sub.points))
    }

    // 3) Il percorso assemblato, in evidenza sopra tutto — doppia linea (fascia bianca sotto) più le
    // frecce di direzione (stesso pattern di components/video/RouteLeafletEditor.tsx), così
    // "Inverti direzione" ha un riscontro visivo immediato. interactive:false: è puro decoro, non
    // deve mai intercettare un click destinato a un tratto adiacente ancora selezionabile — proprio
    // nel punto più delicato, dove il percorso tocca il prossimo tratto da aggiungere.
    if (routePoints.length >= 2) {
      L.polyline(routePoints, { color: '#ffffff', weight: 9, opacity: 0.85, interactive: false }).addTo(layer)
      L.polyline(routePoints, { color: '#1c1917', weight: 5, opacity: 1, interactive: false }).addTo(layer)
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
  }, [metaResults, trailSubSegments, networkSegments, routePoints, usedSegmentIds, pinParts, flashRejectedId])

  const showTrailsZoomHint = zoom < TRAILS_MIN_ZOOM
  const showNetworkZoomHint = zoom >= TRAILS_MIN_ZOOM && zoom < NETWORK_MIN_ZOOM
  const canFinalize = routePoints.length >= 2

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-stone-100">
      <div className="absolute inset-0 isolate">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* ── Header — il caricamento è automatico (con debounce) a ogni pan/zoom, vedi
          searchCurrentViewRef: nessun bottone "Cerca in quest'area" da toccare a ogni spostamento.
          Il refresh qui resta solo come scorciatoia manuale (es. per ritentare dopo un fallimento
          Overpass senza dover muovere la mappa). ─────────────────────────────────────────────── */}
      <div className="absolute left-0 right-0 top-0 z-10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Indietro"
            className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 bg-white/95 backdrop-blur rounded-2xl shadow-md px-3.5 py-2.5 min-w-0 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-stone-800">Crea un percorso a mano</p>
              <p className="text-[11px] text-stone-500">Tocca i tratti sulla mappa per unirli</p>
            </div>
            {loading && <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin shrink-0" />}
          </div>
          <button onClick={searchCurrentView} disabled={loading} aria-label="Aggiorna quest'area"
            className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors disabled:opacity-50 shrink-0">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loadError && (
          <p className="text-center text-[11px] font-medium text-red-600 bg-white/95 backdrop-blur rounded-full py-1.5 px-3 mx-auto w-fit shadow-sm">
            {loadError}
          </p>
        )}
      </div>

      {/* ── Rail: stesse 3 famiglie di CreaGuidaMapSearch.tsx, sempre presente — questo editor è
          "Crea un percorso a mano" (dentro la famiglia Genera, evidenziata), ma deve restare
          possibile passare a Scopri o Porta i tuoi dati senza dover prima tornare indietro a mano. */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-white/95 backdrop-blur rounded-[28px] shadow-md p-1.5 flex flex-col gap-2">
        <button onClick={onBack} title="Scopri sulla mappa" aria-label="Scopri sulla mappa"
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors">
          <SearchIcon className="w-[18px] h-[18px]" />
        </button>
        <button onClick={() => onOpenPanel?.('genera')} title="Genera un percorso" aria-label="Genera un percorso"
          className="w-11 h-11 rounded-2xl flex items-center justify-center bg-terra-500 text-white transition-colors">
          <RouteIcon className="w-[18px] h-[18px]" />
        </button>
        {onOpenPanel && (
          <button onClick={() => onOpenPanel('importa')} title="Porta i tuoi dati" aria-label="Porta i tuoi dati"
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-stone-600 hover:bg-stone-100 transition-colors">
            <Upload className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>

      {(showTrailsZoomHint || showNetworkZoomHint) && (
        <div className="absolute left-0 right-0 top-[76px] z-10 flex justify-center">
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
