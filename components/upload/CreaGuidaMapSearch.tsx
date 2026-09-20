'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Search as SearchIcon, RefreshCw, Loader2, ChevronUp, ChevronDown, X as XIcon,
  Upload, Link2, PencilLine, MapPin, History, ChevronRight, Building2, Landmark, Globe,
  Clock, Milestone, Route as RouteIcon, Sliders, Waypoints,
} from 'lucide-react'
import type { ResultItem } from './RouteBuilder'
import TrailPreviewMap from '@/components/TrailPreviewMap'
import ItineraryMap from '@/components/mete/ItineraryMap'
import { defaultPendingExpiresAt } from './sharedHelpers'
import { saveResultItemToGuide } from '@/lib/routeBuilder/importResultItem'
import { foundRouteItemFromCachedTrail } from '@/lib/routeBuilder/foundRoute'
import { resolvePlaceClientFirst } from '@/lib/routeBuilder/resolvePlaceClient'
import { useCreateMetaFromSearch } from '@/lib/useCreateMetaFromSearch'
import { META_TYPE_CONFIG, SITE_TYPE_CONFIG, type MetaType, type SiteType } from '@/lib/metaTypes'
import { ROUTE_COLORS } from '@/lib/designTokens'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import type { TrailNearbyItem } from '@/app/api/trails-nearby/route'
import type { PlaceDetail } from '@/app/api/places/[id]/route'
import type { BorgoItinerary } from '@/app/api/borgo-itinerary/route'
import SentieroGenerationPanel from './SentieroGenerationPanel'
import PersonalizeItineraryPanel, { type PersonalizeStop } from './PersonalizeItineraryPanel'

type TypeFilter = 'tutto' | MetaType

const ITALY_CENTER: [number, number] = [42.5, 12.5]
const ITALY_ZOOM = 6
// Sotto questo zoom i Sentieri restano nascosti (stile Komoot: compaiono avvicinandosi, mai a
// scala nazionale/regionale dove sarebbero migliaia di tracciati sovrapposti) — stessa soglia già
// validata in components/mete/MeteSearchMap.tsx.
const TRAILS_MIN_ZOOM = 10
// Più stretta di TRAILS_MIN_ZOOM: qui si innesca un fetch Overpass + pathfinding dal vivo (stesso
// costo di lib/routeBuilder/buildSteps.ts's prepareNetworkStep), non una lettura da cache. A z14 il
// raggio a schermo di un viewport tipico (anche un tablet in landscape) resta sotto il tetto di
// sicurezza di 8-10km già imposto lato server (BUILD_DINTORNI_MAX_KM in buildSteps.ts) — "genera
// qui" corrisponde davvero a quanto visibile, invece di un'area silenziosamente più piccola.
const SENTIERO_GEN_MIN_ZOOM = 14
const SEARCH_LIMIT = 60
const PLACE_ZOOM = 13
// "Ampio ma non eccessivo" per la personalizzazione di un itinerario Borgo/Città — un tetto allo
// zoom di fitBounds sull'anchor+tappe, altrimenti poche tappe molto vicine (es. un piccolo centro
// storico) farebbero zoomare fino al singolo isolato.
const PERSONALIZE_MAX_ZOOM = 15

const GLYPH: Record<MetaType, string> = { borgo_citta: '🏘️', sito: '🏛️', sentiero: '🥾' }

type Selected =
  | { kind: 'meta'; item: MetaSearchResultItem }
  | { kind: 'trail'; item: TrailNearbyItem }

// Stato della personalizzazione di un itinerario multi-tappa — `stops` le tappe scelte
// dall'utente nell'ordine di selezione (mai riordinate: è una personalizzazione deliberata), senza
// più un "anchor" distinto: raggiungibile sia dal popup di un Borgo/Città (che semina `stops` con
// il Borgo stesso + il suo itinerario automatico, vedi enterPersonalize) sia da un ingresso
// autonomo sulla mappa che parte da zero (vedi enterPersonalizeStandalone) — in entrambi i casi
// ogni tappa è ugualmente rimovibile, nessuna è più "fissa". `source:'meta'` per una tappa che
// coincide con un pin già disegnato da metaResults (si riusa quello stesso marker, solo con
// badge), `source:'itinerary'` per una tappa dall'itinerario automatico di un Borgo che non ha un
// marker proprio sulla mappa (serve disegnarne uno sintetico).
interface PersonalizeState {
  stops: PersonalizeStop[]
  color: string
}

// Colore neutro per una personalizzazione avviata senza un Borgo di partenza (ingresso autonomo,
// enterPersonalizeStandalone) — quando invece si parte dal popup di un Borgo/Città si riusa il
// colore di quel tipo (META_TYPE_CONFIG.borgo_citta.color) per coerenza visiva con quel contesto.
const PERSONALIZE_DEFAULT_COLOR = '#B0724A'

function trailLatLon(t: TrailNearbyItem): [number, number] | null {
  if (t.geometry.length === 0) return null
  return t.geometry[Math.floor(t.geometry.length / 2)]
}

// Le altre vie per creare una Guida oltre alla ricerca su mappa — prima card separate nella
// schermata di scelta di ManualImportChoice.tsx (rimossa: questa mappa è ora l'unico ingresso),
// ora raggiungibili da qui tramite il pulsante "Altri modi" e rese dal chiamante (app/upload/
// page.tsx), che già possiede GpxUploader/ManualPlanUploader/UrlImportUploader/
// FromActivityUploader e la loro navigazione di ritorno.
export type OtherWayToAdd = 'file' | 'manual' | 'url' | 'from-activity' | 'manual-route'

/**
 * Ricerca su mappa di "Crea Guida" — sostituisce, per le tre tipologie insieme (Sentiero, Borgo/
 * Città, Sito), la vecchia ricerca "Esistenti" a raggio fisso di RouteBuilder.tsx: muovere/
 * zoomare la mappa non cerca da sola, un pulsante "Cerca in quest'area" lo fa esplicitamente
 * (pattern Komoot, stesso di components/mete/MeteSearchMap.tsx). "Crea guida" è un'azione diretta
 * dal risultato — per Borgo/Sito usa lib/useCreateMetaFromSearch.ts (già esistente), per un
 * Sentiero da cache OSM converte la riga in FoundRouteItem
 * (lib/routeBuilder/foundRoute.ts's foundRouteItemFromCachedTrail) e la fa passare dallo stesso
 * salvataggio del wizard (saveResultItemToGuide) — quota reale arricchita al salvataggio, non qui.
 * Le altre vie di creazione vivono dietro la rail a sinistra (vedi Rail più sotto), non più esposte
 * come card equivalenti sulla stessa schermata: "Genera" per le due modalità algoritmiche più "Crea
 * un percorso a mano" (che costruisce comunque sulla mappa), "Porta i tuoi dati" per le vie che
 * portano dati da fuori l'app (file GPX, da un'attività del diario, link, inserimento manuale — vedi
 * onOtherWays). Il generatore "su misura" (RouteBuilder.tsx) non è più raggiunto da qui — restava
 * percepito come "torna alla vecchia ricerca", non un'opzione distinta.
 */
export default function CreaGuidaMapSearch({ onBack, onOtherWays }: { onBack: () => void; onOtherWays?: (mode: OtherWayToAdd) => void }) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup | null>(null)
  const leafletRef = useRef<typeof L | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  // Il primo 'moveend' arriva dal setView() di creazione della mappa, non da un pan/zoom
  // dell'utente — non deve accendere "Cerca in quest'area" (la prima ricerca parte già da sola).
  const initialMoveHandled = useRef(false)

  const [showOtherWays, setShowOtherWays] = useState(false)

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tutto')
  const [metaResults, setMetaResults] = useState<MetaSearchResultItem[]>([])
  const [trailResults, setTrailResults] = useState<TrailNearbyItem[]>([])
  const [zoom, setZoom] = useState(ITALY_ZOOM)
  const [searching, setSearching] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Selected | null>(null)
  const [sheetExpanded, setSheetExpanded] = useState(false)

  const [queryText, setQueryText] = useState('')
  const [resolving, setResolving] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)

  const [savingTrailId, setSavingTrailId] = useState<number | null>(null)
  const [trailSaveError, setTrailSaveError] = useState<string | null>(null)
  const { creatingId: creatingMetaId, createError: metaSaveError, createAndOpen } = useCreateMetaFromSearch()

  // Modalità A — "Genera percorso" per i Sentieri, scoped al viewport corrente (vedi
  // SentieroGenerationPanel.tsx). `sentieroGenOrigin` è uno scatto del centro/raggio della mappa al
  // momento dell'apertura, non un valore che segue la mappa mentre il pannello è aperto.
  const [showSentieroGen, setShowSentieroGen] = useState(false)
  const [sentieroGenOrigin, setSentieroGenOrigin] = useState<{ lat: number; lon: number; radiusKm: number } | null>(null)
  // Scelta fra le due modalità di generazione dal FAB in basso a destra — un tocco più lontano
  // invece di due FAB affiancati (Sentieri e Personalizza), che sulla mappa affollerebbero
  // l'angolo insieme agli altri controlli fissi (peek dei risultati, "Cerca in quest'area").
  const [showGenChooser, setShowGenChooser] = useState(false)

  // Modalità B — personalizzazione di un itinerario multi-tappa, sia dal popup di un Borgo/Città
  // (vedi "Personalizza itinerario" nel tab Itinerario di MetaDetailCard) sia da zero tramite il
  // FAB "Genera" qui sotto (vedi enterPersonalizeStandalone).
  const [personalize, setPersonalize] = useState<PersonalizeState | null>(null)

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

      const wantMeta = typeFilter === 'tutto' || typeFilter === 'borgo_citta' || typeFilter === 'sito'
      const wantTrail = typeFilter === 'tutto' || typeFilter === 'sentiero'
      const metaTypes = typeFilter === 'borgo_citta' || typeFilter === 'sito' ? [typeFilter] as const : ['borgo_citta', 'sito'] as const

      const [metaItems, trailItems] = await Promise.all([
        wantMeta
          ? Promise.all(metaTypes.map(async metaType => {
              const res = await fetch('/api/meta-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metaType, origin, maxDistanceKm: radiusKm, limit: SEARCH_LIMIT }),
              })
              const data = await res.json()
              if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
              return data.items as MetaSearchResultItem[]
            })).then(arrs => arrs.flat())
          : Promise.resolve([]),
        wantTrail && map.getZoom() >= TRAILS_MIN_ZOOM
          ? fetch('/api/trails-nearby', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: origin.lat, lon: origin.lon, radiusKm }),
            }).then(async res => {
              const data = await res.json()
              if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
              return data.items as TrailNearbyItem[]
            })
          : Promise.resolve([]),
      ])

      setMetaResults(metaItems)
      setTrailResults(trailItems)
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricerca non riuscita')
    } finally {
      setSearching(false)
    }
  }

  // Mappa Leaflet — creata una sola volta, stesso motore/tile proxy di LocationPickerMap.tsx e
  // MeteSearchMap.tsx.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    import('leaflet').then(L => {
      if (!mapRef.current || mapInstance.current) return
      leafletRef.current = L

      delete (L.Icon.Default.prototype as any)._getIconUrl
      // zoomControl: false — il +/- di default di Leaflet nasce in alto a sinistra, sotto la
      // freccia "indietro" e la barra di ricerca (stessa chrome che occupa quell'angolo): su
      // schermo stretto i due si sovrappongono. Pinch-to-zoom e doppio tap restano attivi di
      // default (mai disattivati), lo stesso pattern di ogni app mappe mobile-first.
      const map = L.map(mapRef.current!, { zoomControl: false }).setView(ITALY_CENTER, ITALY_ZOOM)
      mapInstance.current = map
      markersLayer.current = L.layerGroup().addTo(map)

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

  // Cambiare tipologia filtra cosa cercare — ricerca subito sulla vista attuale invece di
  // richiedere anche un tap su "Cerca in quest'area" (i confini non sono cambiati, solo cosa
  // mostrare per essi).
  useEffect(() => {
    if (mapInstance.current) searchCurrentView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter])

  // Ridisegna i pin ogni volta che cambiano i risultati — un solo layerGroup svuotato e
  // ricostruito (stesso pattern di MeteSearchMap.tsx).
  useEffect(() => {
    const L = leafletRef.current
    const layer = markersLayer.current
    if (!L || !layer) return
    layer.clearLayers()

    function pinIcon(color: string, glyph: string, big: boolean, opts?: { dimmed?: boolean; badge?: number }) {
      const size = big ? 34 : 28
      const opacity = opts?.dimmed ? 0.35 : 1
      const badgeHtml = opts?.badge != null
        ? `<div style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background:#1c1917;border:1.5px solid white;color:white;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;transform:rotate(45deg)">${opts.badge}</div>`
        : ''
      return L!.divIcon({
        className: '',
        html: `<div style="position:relative;opacity:${opacity}">
          <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:${big ? 3 : 2}px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">
            <span style="transform:rotate(45deg);font-size:${big ? 15 : 13}px;line-height:1">${glyph}</span>
          </div>
          ${badgeHtml}
        </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      })
    }

    // In personalizzazione (vedi PersonalizeState) i Sentieri non sono tappe selezionabili — restano
    // fuori dal disegno per non confondere cosa è toccabile come tappa dell'itinerario Borgo/Città.
    if (!personalize) {
      // Tracciato reale per ogni Sentiero, non solo il pin — un colore diverso a testa (stessa
      // palette/idea di MeteSearchMap.tsx, ROUTE_COLORS in giro) così più tracciati vicini restano
      // distinguibili. Disegnate PRIMA dei pin: restano sotto, mai a coprire un marker toccabile.
      let routeColorIdx = 0
      for (const item of trailResults) {
        if (item.geometry.length < 2) continue
        const color = ROUTE_COLORS[routeColorIdx++ % ROUTE_COLORS.length]
        const isSelected = selected?.kind === 'trail' && selected.item.id === item.id
        const line = L.polyline(item.geometry, { color, weight: isSelected ? 5.5 : 3.5, opacity: isSelected ? 1 : 0.8 })
        line.on('click', () => { setSelected({ kind: 'trail', item }); setSheetExpanded(false) })
        line.addTo(layer)
      }
    }

    for (const item of metaResults) {
      const color = META_TYPE_CONFIG[item.metaType].color
      const isSelected = selected?.kind === 'meta' && selected.item.id === item.id

      if (personalize) {
        const stopIdx = personalize.stops.findIndex(s => s.id === item.id && s.source === 'meta')
        const isStop = stopIdx >= 0
        const icon = isStop
          ? pinIcon(color, GLYPH[item.metaType], true, { badge: stopIdx + 1 })
          : pinIcon(color, GLYPH[item.metaType], false, { dimmed: true })
        const marker = L.marker([item.latitude, item.longitude], { icon })
        marker.on('click', () => {
          togglePersonalizeStop({ id: item.id, lat: item.latitude, lon: item.longitude, name: item.name, source: 'meta', metaType: item.metaType })
        })
        marker.addTo(layer)
        continue
      }

      const marker = L.marker([item.latitude, item.longitude], { icon: pinIcon(color, GLYPH[item.metaType], isSelected) })
      marker.on('click', () => { setSelected({ kind: 'meta', item }); setSheetExpanded(false) })
      marker.addTo(layer)
    }

    // Tappe dell'itinerario automatico che non coincidono con nessun pin già disegnato da
    // metaResults (source:'itinerary', vedi enterPersonalize) — serve un marker proprio, altrimenti
    // resterebbero invisibili/non togglabili.
    if (personalize) {
      personalize.stops.filter(s => s.source === 'itinerary').forEach(stop => {
        const stopIdx = personalize.stops.findIndex(s => s.id === stop.id)
        const marker = L.marker([stop.lat, stop.lon], { icon: pinIcon(personalize.color, '📍', true, { badge: stopIdx + 1 }) })
        marker.on('click', () => togglePersonalizeStop(stop))
        marker.addTo(layer)
      })
    }

    if (!personalize) {
      for (const item of trailResults) {
        const pos = trailLatLon(item)
        if (!pos) continue
        const isSelected = selected?.kind === 'trail' && selected.item.id === item.id
        const marker = L.marker(pos, { icon: pinIcon(META_TYPE_CONFIG.sentiero.color, GLYPH.sentiero, isSelected) })
        marker.on('click', () => { setSelected({ kind: 'trail', item }); setSheetExpanded(false) })
        marker.addTo(layer)
      }
    }
  }, [metaResults, trailResults, selected, personalize])

  async function handleSearchSubmit() {
    const q = queryText.trim()
    if (!q || resolving) return
    setResolving(true)
    setQueryError(null)
    try {
      const place = await resolvePlaceClientFirst(q, false)
      if (!place) { setQueryError('Luogo non trovato — prova un altro nome.'); return }
      const map = mapInstance.current
      if (map) {
        map.setView([place.lat, place.lon], Math.max(map.getZoom(), PLACE_ZOOM))
        await searchCurrentView()
      }
    } catch {
      setQueryError('Ricerca non riuscita — riprova.')
    } finally {
      setResolving(false)
    }
  }

  async function saveTrail(item: TrailNearbyItem) {
    if (savingTrailId != null) return
    setSavingTrailId(item.id)
    setTrailSaveError(null)
    try {
      const pendingExpiresAt = await defaultPendingExpiresAt()
      const found = foundRouteItemFromCachedTrail({
        osmRelationId: item.id,
        name: item.name,
        distanceKm: item.distanceKm,
        elevationGain: item.elevationGain,
        elevationLoss: item.elevationLoss,
        estimatedTimeMin: item.estimatedTimeMin,
        difficulty: item.difficulty,
        dataQuality: item.dataQuality,
        geometrySimplified: item.geometry,
      })
      const resultItem: ResultItem = { kind: 'found', data: found }
      const hike = await saveResultItemToGuide(resultItem, found.name, '', pendingExpiresAt)
      router.push(`/guida/${encodeURIComponent(hike.id)}`)
    } catch (e) {
      setTrailSaveError(e instanceof Error ? e.message : 'Impossibile creare la guida — riprova.')
      setSavingTrailId(null)
    }
  }

  // Apre il pannello "Genera percorso" (Sentieri) con centro/raggio scattati dal viewport corrente
  // — nessun ricalcolo mentre il pannello resta aperto, un tap fuori tempo massimo (zoom
  // insufficiente) non apre nulla.
  function openSentieroGen() {
    const map = mapInstance.current
    if (!map || map.getZoom() < SENTIERO_GEN_MIN_ZOOM) return
    const bounds = map.getBounds()
    const center = bounds.getCenter()
    const radiusKm = center.distanceTo(bounds.getNorthEast()) / 1000
    setSentieroGenOrigin({ lat: center.lat, lon: center.lng, radiusKm })
    setShowSentieroGen(true)
  }

  // Apre la personalizzazione a partire dal popup di un Borgo/Città — chiude il popup, semina le
  // tappe col Borgo stesso (prima tappa, come qualunque altra — rimovibile anche lei, nessun
  // "anchor" fisso: vedi PersonalizeState) seguito dall'itinerario automatico se ce n'è già uno con
  // risultati (una tappa che coincide con un pin già disegnato da metaResults riusa quel marker con
  // un badge, `source:'meta'`; una tappa solo-Wikipedia senza marker proprio, `source:'itinerary'`,
  // ne disegna uno sintetico — vedi l'effetto di disegno marker sopra), altrimenti solo il Borgo
  // (`itinerary` null o senza stop: l'automatico spesso non trova nulla di utilizzabile, l'utente
  // sceglie il resto a mano). Inquadra la mappa "ampia ma non eccessiva" sulle tappe già seminate.
  function enterPersonalize(borgo: MetaSearchResultItem, itinerary: BorgoItinerary | null) {
    setSelected(null)
    const seedStops: PersonalizeStop[] = [
      { id: borgo.id, lat: borgo.latitude, lon: borgo.longitude, name: borgo.name, source: 'meta', metaType: borgo.metaType },
      ...(itinerary?.stops ?? []).map(s => ({
        id: s.id, lat: s.lat, lon: s.lon, name: s.name,
        source: (metaResults.some(m => m.id === s.id) ? 'meta' : 'itinerary') as PersonalizeStop['source'],
      })),
    ]
    setPersonalize({ stops: seedStops, color: META_TYPE_CONFIG.borgo_citta.color })
    const map = mapInstance.current
    const L = leafletRef.current
    if (map && L) {
      const points: [number, number][] = seedStops.map(s => [s.lat, s.lon])
      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: PERSONALIZE_MAX_ZOOM })
      } else {
        map.setView([borgo.latitude, borgo.longitude], Math.min(Math.max(map.getZoom(), PLACE_ZOOM), PERSONALIZE_MAX_ZOOM))
      }
    }
  }

  // Apre la personalizzazione da zero, senza passare dal popup di un Borgo — ingresso autonomo
  // dalla mappa (vedi il pulsante "Genera", più sotto): nessuna tappa già scelta, l'utente parte
  // toccando i pin che vuole, la vista resta quella corrente (nessun fitBounds, non c'è ancora
  // nulla su cui inquadrare).
  function enterPersonalizeStandalone() {
    setSelected(null)
    setPersonalize({ stops: [], color: PERSONALIZE_DEFAULT_COLOR })
  }

  // Tocco su un pin mentre la personalizzazione è attiva: aggiunge/toglie quel punto dalle tappe
  // scelte invece di aprire il popup di dettaglio — nessuna tappa è più "fissa" (vedi
  // PersonalizeState). Le nuove tappe si aggiungono in coda (mai un riordino automatico).
  function togglePersonalizeStop(stop: PersonalizeStop) {
    setPersonalize(prev => {
      if (!prev) return prev
      const exists = prev.stops.some(s => s.id === stop.id)
      return { ...prev, stops: exists ? prev.stops.filter(s => s.id !== stop.id) : [...prev.stops, stop] }
    })
  }

  function removePersonalizeStop(id: string) {
    setPersonalize(prev => (prev ? { ...prev, stops: prev.stops.filter(s => s.id !== id) } : prev))
  }

  const totalResults = metaResults.length + trailResults.length
  const wantsTrails = typeFilter === 'tutto' || typeFilter === 'sentiero'
  const showTrailZoomHint = wantsTrails && zoom < TRAILS_MIN_ZOOM
  // Zoom sufficiente e Sentieri cercati, ma la cache `trails` non ne ha per quest'area — distinto
  // dal messaggio generico "nessun risultato" (che qui non scatterebbe comunque se Borghi/Siti
  // hanno trovato qualcosa): la cache si popola sull'uso (lib/routeBuilder/generateRecommendations.ts)
  // e da un pre-riscaldamento manuale per regione (app/api/admin/prewarm-trails/route.ts) — un'area
  // mai visitata prima può restare vuota anche a zoom corretto, non è un guasto.
  const trailsEmptyAtThisZoom = wantsTrails && !showTrailZoomHint && !searching && trailResults.length === 0

  const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
    { id: 'tutto', label: 'Tutto' },
    { id: 'sentiero', label: META_TYPE_CONFIG.sentiero.pluralLabel },
    { id: 'borgo_citta', label: META_TYPE_CONFIG.borgo_citta.pluralLabel },
    { id: 'sito', label: META_TYPE_CONFIG.sito.pluralLabel },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-stone-100">
      {/* isolate: contiene lo stacking context di Leaflet dentro questo div, stesso fix già usato
          nello step "start" di RouteBuilder.tsx per lo stesso problema. */}
      <div className="absolute inset-0 isolate">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* ── Header: indietro + barra di ricerca ─────────────────────────── */}
      <div className="absolute left-0 right-0 top-0 z-10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Indietro"
            className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 flex items-center gap-2 bg-white/95 backdrop-blur rounded-2xl shadow-md px-3.5 py-2.5 min-w-0">
            {resolving ? <Loader2 className="w-4 h-4 text-stone-400 shrink-0 animate-spin" /> : <SearchIcon className="w-4 h-4 text-stone-400 shrink-0" />}
            <input
              value={queryText}
              onChange={e => { setQueryText(e.target.value); setQueryError(null) }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearchSubmit() }}
              placeholder="Borgo, sito o sentiero…"
              className="flex-1 min-w-0 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
            />
            {queryText && (
              <button onClick={() => { setQueryText(''); setQueryError(null) }} aria-label="Cancella ricerca" className="text-stone-400 shrink-0">
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <div className="inline-flex bg-white/95 backdrop-blur rounded-full shadow-md p-1 gap-1">
            {TYPE_FILTERS.map(f => (
              <button key={f.id} type="button" onClick={() => { setTypeFilter(f.id); setSelected(null) }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${typeFilter === f.id ? 'bg-stone-800 text-white' : 'text-stone-500'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {queryError && (
          <p className="text-center text-[11px] font-medium text-red-600 bg-white/95 backdrop-blur rounded-full py-1.5 px-3 mx-auto w-fit shadow-sm">
            {queryError}
          </p>
        )}
      </div>

      {/* ── "Cerca in quest'area" — compare solo dopo che l'utente ha mosso la mappa (pattern
          Komoot, stesso di MeteSearchMap.tsx), mai a ogni pan/zoom automatico. Nascosto durante la
          personalizzazione di un itinerario Borgo/Città: lì un pan/zoom non deve riavviare la
          ricerca normale, solo la vista sull'anchor+tappe. ─────────────────────────────────────── */}
      {dirty && !personalize && (
        <div className="absolute left-0 right-0 top-[112px] z-10 flex justify-center">
          <button onClick={searchCurrentView} disabled={searching}
            className="flex items-center gap-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg disabled:opacity-70 transition-colors">
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Cerca in quest&apos;area
          </button>
        </div>
      )}

      {showTrailZoomHint && !personalize && (
        <div className="absolute left-0 right-0 z-10 flex justify-center" style={{ top: dirty ? '158px' : '112px' }}>
          <p className="bg-white/90 backdrop-blur text-stone-500 text-[11px] px-3 py-1.5 rounded-full shadow border border-stone-200">
            Avvicinati per vedere anche i Sentieri
          </p>
        </div>
      )}

      {error && !personalize && (
        <div className="absolute left-3 right-3 top-[160px] z-10 bg-red-500/95 backdrop-blur rounded-xl px-3 py-2 shadow-md text-center">
          <p className="text-xs text-white">{error}</p>
        </div>
      )}

      {/* ── Rail: le 3 famiglie di pari livello per creare una guida — Scopri (ricerca sulla mappa,
          selezionata di default: il suo contenuto è già nell'header sopra, non apre un foglio),
          Genera (le modalità algoritmiche + "a mano") e Porta i tuoi dati (le vie che portano dati
          da fuori l'app). Nascosta durante popup/personalizzazione, per non sovrapporsi ad altri
          controlli fissi sulla mappa. ──────────────────────────────────────────────────────────── */}
      {!selected && !personalize && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-white/95 backdrop-blur rounded-[28px] shadow-md p-1.5 flex flex-col gap-2">
          <button onClick={() => { setShowGenChooser(false); setShowOtherWays(false) }}
            title="Scopri sulla mappa" aria-label="Scopri sulla mappa"
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${!showGenChooser && !showOtherWays ? 'bg-forest-600 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
            <SearchIcon className="w-[18px] h-[18px]" />
          </button>
          <button onClick={() => setShowGenChooser(true)}
            title="Genera un percorso" aria-label="Genera un percorso"
            className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${showGenChooser ? 'bg-terra-500 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
            <RouteIcon className="w-[18px] h-[18px]" />
          </button>
          {onOtherWays && (
            <button onClick={() => setShowOtherWays(true)}
              title="Porta i tuoi dati" aria-label="Porta i tuoi dati"
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-colors ${showOtherWays ? 'bg-stone-700 text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
              <Upload className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      )}

      {/* ── Scheda del pin selezionato — il popup È la scheda (niente più un link "Scheda" a
          parte): foto o mappa del tracciato in testa, informazioni sotto (a tab quando ce n'è
          abbastanza da separare), "Crea guida" come unica azione in fondo. Sfondo scurito/sfocato
          dietro, per dargli risalto sulla mappa — tocco fuori per chiudere, come gli altri fogli. */}
      {selected && (
        <div className="fixed inset-0 z-[15] bg-stone-900/30 backdrop-blur-[2px]" onClick={() => setSelected(null)} />
      )}
      {selected && (
        <div className="absolute left-3 right-3 z-20" style={{ top: '112px' }}>
          <div className="relative bg-white/97 backdrop-blur rounded-2xl shadow-lg max-w-sm mx-auto overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: 'min(66vh, 560px)' }}>
              {selected.kind === 'meta' ? (
                <MetaDetailCard
                  item={selected.item}
                  creating={creatingMetaId === selected.item.id}
                  onCreate={() => createAndOpen(selected.item)}
                  error={metaSaveError && creatingMetaId === null ? metaSaveError : null}
                  onPersonalize={itinerary => enterPersonalize(selected.item, itinerary)}
                />
              ) : (
                <TrailDetailCard
                  item={selected.item}
                  saving={savingTrailId === selected.item.id}
                  onCreate={() => saveTrail(selected.item)}
                  error={trailSaveError && savingTrailId === null ? trailSaveError : null}
                />
              )}
            </div>
            <button onClick={() => setSelected(null)} aria-label="Chiudi"
              className="absolute right-2.5 top-2.5 w-7 h-7 rounded-full bg-stone-900/55 hover:bg-stone-900/70 backdrop-blur-sm flex items-center justify-center text-white transition-colors">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Foglio risultati — peek sempre visibile, tap per espandere la lista completa. Nascosto
          durante la personalizzazione di un itinerario: PersonalizeItineraryPanel occupa lo stesso
          angolo basso-fisso dello schermo. ──────────────────────────────────────────────────────── */}
      {!personalize && (
      <div className="absolute left-0 right-0 bottom-0 z-10 bg-white rounded-t-3xl shadow-[0_-6px_20px_rgba(0,0,0,.12)] flex flex-col"
        style={{ maxHeight: sheetExpanded ? '58vh' : '96px' }}>
        <button onClick={() => setSheetExpanded(v => !v)}
          className="shrink-0 flex flex-col items-center pt-2.5 pb-2.5 w-full">
          <span className="w-9 h-1 rounded-full bg-stone-200 mb-2.5" />
          <span className="flex items-center gap-1.5 text-sm font-bold text-stone-800">
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {totalResults} risultat{totalResults === 1 ? 'o' : 'i'} nella zona
            {sheetExpanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" /> : <ChevronUp className="w-3.5 h-3.5 text-stone-400" />}
          </span>
          {!sheetExpanded && <span className="text-[10.5px] text-stone-400 mt-0.5">Scorri verso l&apos;alto per la lista completa</span>}
        </button>

        {sheetExpanded && (
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {totalResults === 0 && !searching && (
              <p className="text-sm text-center text-stone-400 py-8">Nessun risultato — allarga la ricerca o muovi la mappa.</p>
            )}
            {trailsEmptyAtThisZoom && (
              <p className="text-xs text-stone-400 text-center py-2">
                Nessun sentiero già in cache per quest&apos;area — la copertura è ancora parziale, prova un&apos;altra zona.
              </p>
            )}
            {metaResults.map(item => (
              <MetaRow key={item.id} item={item} creating={creatingMetaId === item.id} onCreate={() => createAndOpen(item)} onSelect={() => { setSelected({ kind: 'meta', item }); setSheetExpanded(false) }} />
            ))}
            {trailResults.map(item => (
              <TrailRow key={item.id} item={item} saving={savingTrailId === item.id} onCreate={() => saveTrail(item)} onSelect={() => { setSelected({ kind: 'trail', item }); setSheetExpanded(false) }} />
            ))}
          </div>
        )}
      </div>
      )}

      {personalize && (
        <PersonalizeItineraryPanel
          stops={personalize.stops}
          color={personalize.color}
          onRemoveStop={removePersonalizeStop}
          onClose={() => setPersonalize(null)}
          onSaved={hikeId => router.push(`/guida/${encodeURIComponent(hikeId)}`)}
        />
      )}

      {showSentieroGen && sentieroGenOrigin && (
        <SentieroGenerationPanel
          origin={sentieroGenOrigin}
          onBack={() => setShowSentieroGen(false)}
          onSaved={hikeId => router.push(`/guida/${encodeURIComponent(hikeId)}`)}
        />
      )}

      {/* ── "Genera" — le due modalità algoritmiche (Sentieri dal vivo sul viewport, itinerario
          personalizzato) più "Crea un percorso a mano": costruisce comunque sulla mappa, non porta
          dati da fuori, per questo vive qui e non in "Porta i tuoi dati". Stesso pattern del foglio
          "Porta i tuoi dati" qui sotto. */}
      {showGenChooser && (
        <>
          <div className="fixed inset-0 z-30 bg-stone-900/20" onClick={() => setShowGenChooser(false)} />
          <div className="fixed left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,.15)] p-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-stone-800">Genera un percorso</p>
              <button onClick={() => setShowGenChooser(false)} aria-label="Chiudi"
                className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <OtherWayRow icon={RouteIcon} label="Genera un sentiero qui"
                description={zoom < SENTIERO_GEN_MIN_ZOOM ? 'Avvicinati sulla mappa per usare questa modalità.' : "Un percorso ad anello nel punto della mappa che stai guardando."}
                onClick={() => { if (zoom < SENTIERO_GEN_MIN_ZOOM) return; setShowGenChooser(false); openSentieroGen() }} />
              <OtherWayRow icon={Sliders} label="Personalizza un itinerario"
                description="Scegli a mano le tappe da toccare sulla mappa, in qualunque ordine."
                onClick={() => { setShowGenChooser(false); enterPersonalizeStandalone() }} />
              {onOtherWays && (
                <OtherWayRow icon={Waypoints} label="Crea un percorso a mano" description="Unisci tratti di Percorsi e Sentieri sulla mappa, come un editor."
                  onClick={() => { setShowGenChooser(false); onOtherWays('manual-route') }} />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── "Porta i tuoi dati" — le vie di creazione che portano dati da fuori l'app (file GPX, da
          un'attività del diario, link, inserimento manuale), un tocco più lontano invece che card
          equivalenti sulla stessa schermata. */}
      {showOtherWays && onOtherWays && (
        <>
          <div className="fixed inset-0 z-30 bg-stone-900/20" onClick={() => setShowOtherWays(false)} />
          <div className="fixed left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,.15)] p-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-stone-800">Porta i tuoi dati</p>
              <button onClick={() => setShowOtherWays(false)} aria-label="Chiudi"
                className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <OtherWayRow icon={Link2} label="Importa da un link" description="Incolla l'indirizzo di una pagina — proviamo a scaricarne la traccia reale."
                onClick={() => { setShowOtherWays(false); onOtherWays('url') }} />
              <OtherWayRow icon={MapPin} label="Carica un file GPX" description="Un file traccia già pronto (GPX, KML o GeoJSON)."
                onClick={() => { setShowOtherWays(false); onOtherWays('file') }} />
              <OtherWayRow icon={History} label="Da un'attività del diario" description="Clona un'escursione già registrata come punto di partenza."
                onClick={() => { setShowOtherWays(false); onOtherWays('from-activity') }} />
              <OtherWayRow icon={PencilLine} label="Inserisci a mano" description="Hai già tutti i dati? Compila nome, distanza e dislivello senza cercare nulla."
                onClick={() => { setShowOtherWays(false); onOtherWays('manual') }} />
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

function OtherWayRow({ icon: Icon, label, description, onClick }: { icon: typeof Link2; label: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 text-left rounded-2xl border border-stone-200 p-3.5 hover:border-forest-300 transition-colors">
      <span className="w-9 h-9 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-stone-800">{label}</span>
        <span className="block text-xs text-stone-500">{description}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
    </button>
  )
}

function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  if (tabs.length <= 1) return null
  return (
    <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5 mb-2.5">
      {tabs.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${active === t.id ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function InfoRow({ icon: Icon, href, children }: { icon: typeof MapPin; href?: string; children: ReactNode }) {
  const content = (
    <span className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
      <span>{children}</span>
    </span>
  )
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="block text-xs text-forest-700 hover:underline">{content}</a>
    : <p className="text-xs text-stone-600">{content}</p>
}

// ── Borgo/Città e Sito — il popup del pin È la scheda: sul tap carica il dettaglio completo da
// /api/places/:id (stessa fonte di app/mete/[id]/page.tsx: descrizione/Wikipedia, indirizzo,
// contatti, orari, fonti) invece di limitarsi ai pochi campi già presenti nel risultato di
// ricerca — un link "Scheda" a parte non serve più.
type MetaTab = 'descrizione' | 'info' | 'itinerario'

function MetaDetailCard({ item, creating, onCreate, error, onPersonalize }: {
  item: MetaSearchResultItem; creating: boolean; onCreate: () => void; error: string | null
  // Solo per un Borgo/Città (vedi isBorgo sotto) — apre la personalizzazione multi-tappa
  // (CreaGuidaMapSearch.tsx's enterPersonalize). Sempre selezionabile, non solo dopo un
  // itinerario automatico riuscito (spesso l'automatico non trova tappe/cammini utilizzabili
  // nella zona): `null` quando l'utente non ha ancora generato nulla, o l'ha generato ma senza
  // risultati — in entrambi i casi si parte da zero tappe, scelte a mano sulla mappa.
  onPersonalize: (itinerary: BorgoItinerary | null) => void
}) {
  const [detail, setDetail] = useState<PlaceDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(true)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [tab, setTab] = useState<MetaTab>('descrizione')

  const [itinerary, setItinerary] = useState<BorgoItinerary | null>(null)
  const [itLoading, setItLoading] = useState(false)
  const [itError, setItError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setLoadingDetail(true)
    setDetailError(null)
    setItinerary(null)
    setItLoading(false)
    setItError(null)
    fetch(`/api/places/${encodeURIComponent(item.id)}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
        if (!cancelled) {
          setDetail(data as PlaceDetail)
          setTab(data.description || data.wikipedia ? 'descrizione' : 'info')
        }
      })
      .catch(e => { if (!cancelled) setDetailError(e instanceof Error ? e.message : 'Impossibile caricare la scheda') })
      .finally(() => { if (!cancelled) setLoadingDetail(false) })
    return () => { cancelled = true }
  }, [item.id])

  async function generateItinerary() {
    if (itLoading) return
    setItLoading(true)
    setItError(null)
    try {
      const res = await fetch('/api/borgo-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: item.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Errore ${res.status}`)
      setItinerary(data as BorgoItinerary)
    } catch (e) {
      setItError(e instanceof Error ? e.message : "Impossibile generare l'itinerario")
    } finally {
      setItLoading(false)
    }
  }

  const cfg = META_TYPE_CONFIG[item.metaType]
  const TypeIcon = item.metaType === 'sito' ? Landmark : Building2
  const siteLabel = detail?.siteType ? SITE_TYPE_CONFIG[detail.siteType as SiteType].label : (item.siteType ? SITE_TYPE_CONFIG[item.siteType].label : null)
  const location = [item.municipality, item.province, item.region].filter(Boolean).join(', ')
  const photo = detail?.imageUrl || detail?.wikipedia?.thumbnail || item.imageUrl
  const hasDescription = !!(detail?.description || detail?.wikipedia?.extract)
  // Solo un Borgo/Città ha un itinerario a piedi tra le sue tappe (piano §48.9 — mai per un Sito,
  // che non ha "tappe" proprie) — stesso endpoint/componente già usati da app/mete/[id]/page.tsx.
  const isBorgo = item.metaType === 'borgo_citta'

  const tabs: { id: MetaTab; label: string }[] = [
    ...(hasDescription ? [{ id: 'descrizione' as const, label: 'Descrizione' }] : []),
    { id: 'info' as const, label: 'Info' },
    ...(isBorgo ? [{ id: 'itinerario' as const, label: 'Itinerario' }] : []),
  ]

  return (
    <div>
      <div className="relative h-36 bg-stone-100">
        {photo ? (
          <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${cfg.color}, #2E3A26)` }}>
            <TypeIcon className="w-10 h-10 text-white/30" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-14" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.55))' }} />
        <span className="absolute left-3 bottom-2.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {siteLabel ?? cfg.label}
        </span>
      </div>

      <div className="p-3.5">
        {location && <p className="text-[10px] text-stone-400 truncate mb-0.5">{location}</p>}
        <p className="font-display text-[15px] font-semibold text-stone-800 mb-2.5">{item.name}</p>

        {loadingDetail && (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-stone-300" /></div>
        )}
        {detailError && <p className="text-xs text-red-600 mb-2">{detailError}</p>}

        {detail && (
          <>
            <TabBar tabs={tabs} active={tab} onChange={setTab} />

            {tab === 'descrizione' && hasDescription && (
              <div className="mb-1">
                <p className="text-xs text-stone-600 leading-relaxed">{detail.description || detail.wikipedia?.extract}</p>
                {!detail.description && detail.wikipedia && (
                  <a href={detail.wikipedia.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-forest-700 hover:underline mt-1.5 inline-block">
                    Leggi su Wikipedia →
                  </a>
                )}
              </div>
            )}

            {tab === 'info' && (
              <div className="space-y-1.5 mb-1">
                {detail.address && <InfoRow icon={MapPin}>{detail.address}</InfoRow>}
                {(detail.website || detail.officialUrl) && (
                  <InfoRow icon={Globe} href={detail.website ?? detail.officialUrl ?? undefined}>{detail.website ?? detail.officialUrl}</InfoRow>
                )}
                {typeof detail.openingHours === 'string' && detail.openingHours && (
                  <InfoRow icon={Clock}>{detail.openingHours}</InfoRow>
                )}
                {detail.coordinatesApproximate && (
                  <p className="text-[11px] text-amber-600">Posizione approssimativa — centro del Comune, non il punto esatto.</p>
                )}
                <p className="text-[11px] text-stone-400 pt-0.5">
                  Dato aggregato da {detail.sourceCount} {detail.sourceCount === 1 ? 'fonte' : 'fonti'} · confidenza {detail.confidence.toFixed(2)}
                </p>
              </div>
            )}

            {tab === 'itinerario' && (
              <div className="mb-1">
                {/* Sempre entrambe visibili, non solo dopo un tentativo automatico riuscito —
                    l'automatico spesso non trova tappe/cammini utilizzabili nella zona, in quel
                    caso l'utente deve poter scegliere le tappe a mano senza restare bloccato. */}
                <div className="flex gap-1.5 mb-2">
                  <button onClick={generateItinerary} disabled={itLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-stone-200 rounded-lg py-2 text-xs font-bold text-stone-700 hover:border-forest-300 disabled:opacity-60 transition-colors">
                    <RouteIcon className="w-3.5 h-3.5" /> {itinerary ? 'Rigenera automatico' : 'Genera automatico'}
                  </button>
                  <button onClick={() => onPersonalize(itinerary)}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-forest-300 bg-forest-50 rounded-lg py-2 text-xs font-bold text-forest-700 hover:bg-forest-100 transition-colors">
                    <Sliders className="w-3.5 h-3.5" /> Scegli le tappe a mano
                  </button>
                </div>

                {itLoading && (
                  <div className="flex items-center justify-center gap-2 text-xs text-stone-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cerco le tappe e il cammino migliore…
                  </div>
                )}

                {itError && <p className="text-xs text-red-600 mb-2">{itError}</p>}

                {itinerary && itinerary.stops.length === 0 && (
                  <p className="text-xs text-stone-400 py-2">Nessuna tappa trovata nei dintorni — solo l&apos;archivio e Wikipedia, non un elenco esaustivo.</p>
                )}

                {itinerary && itinerary.stops.length > 0 && (
                  <>
                    <p className="text-[11px] text-stone-500 mb-2">
                      {itinerary.stops.length} tappe · {(itinerary.totalDistanceM / 1000).toFixed(1)} km · ~{Math.round(itinerary.estimatedTimeSeconds / 60)} min a piedi
                    </p>
                    {itinerary.legs.some(l => !l.real) && (
                      <p className="text-[11px] text-amber-600 mb-2">
                        {itinerary.legs.every(l => !l.real)
                          ? 'La rete pedonale non ha risposto in tempo: nessun tratto segue vie reali, solo linee dirette — riprova tra poco.'
                          : 'Alcuni tratti sono linee dirette (nessuna via trovata per quella tappa), il resto segue vie reali.'}
                      </p>
                    )}
                    <ItineraryMap
                      center={{ lat: item.latitude, lon: item.longitude }}
                      stops={itinerary.stops}
                      legs={itinerary.legs}
                      color={cfg.color}
                      height="176px"
                    />
                    <ol className="flex flex-col gap-1.5 mt-2">
                      {itinerary.stops.map((stop, i) => (
                        <li key={stop.id} className="flex items-center gap-2">
                          <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: cfg.color }}>
                            {i + 1}
                          </span>
                          <span className="text-xs text-stone-700 truncate">{stop.name}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        <button onClick={onCreate} disabled={creating}
          className="w-full flex items-center justify-center gap-1.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 rounded-lg py-2 text-xs font-bold text-white transition-colors">
          {creating && <Loader2 className="w-3 h-3 animate-spin" />} Crea guida
        </button>
      </div>
    </div>
  )
}

// ── Sentiero — la scheda mostra l'estratto di mappa col solo tracciato (stesso TrailPreviewMap
// già usato dalle card di RouteBuilder.tsx) invece di una foto, e i campi descrittivi della cache
// `trails` (vedi app/api/trails-nearby/route.ts) organizzati in due tab.
type TrailTab = 'dettagli' | 'descrizione'

function TrailDetailCard({ item, saving, onCreate, error }: { item: TrailNearbyItem; saving: boolean; onCreate: () => void; error: string | null }) {
  const hasDescription = !!item.description
  const [tab, setTab] = useState<TrailTab>('dettagli')
  const tabs: { id: TrailTab; label: string }[] = hasDescription
    ? [{ id: 'dettagli', label: 'Dettagli' }, { id: 'descrizione', label: 'Descrizione' }]
    : [{ id: 'dettagli', label: 'Dettagli' }]

  const stats: { label: string; val: string }[] = [
    item.distanceKm != null ? { label: 'Distanza', val: `${item.distanceKm.toFixed(1)} km` } : null,
    item.elevationGain != null ? { label: 'Dislivello +', val: `${Math.round(item.elevationGain)} m` } : null,
    item.elevationLoss != null ? { label: 'Dislivello −', val: `${Math.round(item.elevationLoss)} m` } : null,
    item.estimatedTimeMin != null ? { label: 'Tempo stimato', val: `${Math.round(item.estimatedTimeMin / 60)} h ${item.estimatedTimeMin % 60} min` } : null,
    item.difficulty ? { label: 'Difficoltà CAI', val: item.difficulty } : null,
  ].filter((s): s is { label: string; val: string } => s !== null)

  return (
    <div>
      <div className="relative isolate h-36">
        <TrailPreviewMap polyline={item.geometry} height="144px" />
      </div>

      <div className="p-3.5">
        {(item.fromLabel || item.toLabel) && (
          <p className="text-[10px] text-stone-400 truncate mb-0.5">
            {[item.fromLabel, item.toLabel].filter(Boolean).join(' → ')}
          </p>
        )}
        <p className="font-display text-[15px] font-semibold text-stone-800 mb-2.5">{item.name || 'Sentiero senza nome'}</p>

        <TabBar tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'dettagli' && (
          <div className="mb-1">
            {stats.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {stats.map(s => (
                  <div key={s.label} className="bg-stone-50 rounded-lg border border-stone-100 px-2.5 py-1.5">
                    <p className="text-[9px] text-stone-400">{s.label}</p>
                    <p className="text-xs font-semibold text-stone-800">{s.val}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {item.ref && <InfoRow icon={Milestone}>Segnavia {item.ref}</InfoRow>}
              {item.network && <InfoRow icon={RouteIcon}>{item.network}</InfoRow>}
            </div>
          </div>
        )}

        {tab === 'descrizione' && hasDescription && (
          <p className="text-xs text-stone-600 leading-relaxed mb-1">{item.description}</p>
        )}

        {error && <p className="text-xs text-red-600 mb-2 mt-1.5">{error}</p>}

        <button onClick={onCreate} disabled={saving}
          className="w-full flex items-center justify-center gap-1.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 rounded-lg py-2 text-xs font-bold text-white transition-colors mt-1">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />} Crea guida
        </button>
      </div>
    </div>
  )
}

function MetaRow({ item, creating, onCreate, onSelect }: { item: MetaSearchResultItem; creating: boolean; onCreate: () => void; onSelect: () => void }) {
  const location = [item.municipality, item.province].filter(Boolean).join(', ')
  return (
    <div className="flex items-center gap-3 bg-stone-50 border border-stone-100 rounded-2xl p-2.5">
      <button onClick={onSelect} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span className="text-xl shrink-0" aria-hidden>{GLYPH[item.metaType]}</span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-stone-800 truncate">{item.name}</span>
          <span className="block text-[11px] text-stone-400 truncate">{META_TYPE_CONFIG[item.metaType].label}{location ? ` · ${location}` : ''}{item.distanceKm != null ? ` · ${item.distanceKm.toFixed(1)} km` : ''}</span>
        </span>
      </button>
      <button onClick={onCreate} disabled={creating}
        className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-white bg-forest-600 hover:bg-forest-700 disabled:opacity-60 rounded-full px-3 py-1.5 transition-colors">
        {creating && <Loader2 className="w-3 h-3 animate-spin" />} Crea
      </button>
    </div>
  )
}

function TrailRow({ item, saving, onCreate, onSelect }: { item: TrailNearbyItem; saving: boolean; onCreate: () => void; onSelect: () => void }) {
  const stats = [
    item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km` : null,
    item.elevationGain != null ? `+${Math.round(item.elevationGain)} m` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-3 bg-stone-50 border border-stone-100 rounded-2xl p-2.5">
      <button onClick={onSelect} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span className="text-xl shrink-0" aria-hidden>{GLYPH.sentiero}</span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-stone-800 truncate">{item.name || 'Sentiero senza nome'}</span>
          <span className="block text-[11px] text-stone-400 truncate">{META_TYPE_CONFIG.sentiero.label}{stats ? ` · ${stats}` : ''}</span>
        </span>
      </button>
      <button onClick={onCreate} disabled={saving}
        className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-white bg-forest-600 hover:bg-forest-700 disabled:opacity-60 rounded-full px-3 py-1.5 transition-colors">
        {saving && <Loader2 className="w-3 h-3 animate-spin" />} Crea
      </button>
    </div>
  )
}
