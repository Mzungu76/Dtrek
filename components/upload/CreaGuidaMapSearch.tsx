'use client'
import 'leaflet/dist/leaflet.css'
import type * as L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Search as SearchIcon, RefreshCw, Loader2, ChevronUp, ChevronDown, X as XIcon,
  MoreHorizontal, Link2, PencilLine, MapPin, History, ChevronRight,
} from 'lucide-react'
import RouteBuilder, { type ResultItem } from './RouteBuilder'
import { defaultPendingExpiresAt } from './sharedHelpers'
import { saveResultItemToGuide } from '@/lib/routeBuilder/importResultItem'
import { foundRouteItemFromCachedTrail } from '@/lib/routeBuilder/foundRoute'
import { resolvePlaceClientFirst } from '@/lib/routeBuilder/resolvePlaceClient'
import { useCreateMetaFromSearch } from '@/lib/useCreateMetaFromSearch'
import { META_TYPE_CONFIG, type MetaType } from '@/lib/metaTypes'
import type { MetaSearchResultItem } from '@/lib/metaSearch/types'
import type { TrailNearbyItem } from '@/app/api/trails-nearby/route'

type TypeFilter = 'tutto' | MetaType

const ITALY_CENTER: [number, number] = [42.5, 12.5]
const ITALY_ZOOM = 6
// Sotto questo zoom i Sentieri restano nascosti (stile Komoot: compaiono avvicinandosi, mai a
// scala nazionale/regionale dove sarebbero migliaia di tracciati sovrapposti) — stessa soglia già
// validata in components/mete/MeteSearchMap.tsx.
const TRAILS_MIN_ZOOM = 10
const SEARCH_LIMIT = 60
const PLACE_ZOOM = 13

const GLYPH: Record<MetaType, string> = { borgo_citta: '🏘️', sito: '🏛️', sentiero: '🥾' }

type Selected =
  | { kind: 'meta'; item: MetaSearchResultItem }
  | { kind: 'trail'; item: TrailNearbyItem }

function trailLatLon(t: TrailNearbyItem): [number, number] | null {
  if (t.geometry.length === 0) return null
  return t.geometry[Math.floor(t.geometry.length / 2)]
}

// Le altre vie per creare una Guida oltre alla ricerca su mappa — prima card separate nella
// schermata di scelta di ManualImportChoice.tsx (rimossa: questa mappa è ora l'unico ingresso),
// ora raggiungibili da qui tramite il pulsante "Altri modi" e rese dal chiamante (app/upload/
// page.tsx), che già possiede GpxUploader/ManualPlanUploader/UrlImportUploader/
// FromActivityUploader e la loro navigazione di ritorno.
export type OtherWayToAdd = 'file' | 'manual' | 'url' | 'from-activity'

/**
 * Ricerca su mappa di "Crea Guida" — sostituisce, per le tre tipologie insieme (Sentiero, Borgo/
 * Città, Sito), la vecchia ricerca "Esistenti" a raggio fisso di RouteBuilder.tsx: muovere/
 * zoomare la mappa non cerca da sola, un pulsante "Cerca in quest'area" lo fa esplicitamente
 * (pattern Komoot, stesso di components/mete/MeteSearchMap.tsx). "Crea guida" è un'azione diretta
 * dal risultato — per Borgo/Sito usa lib/useCreateMetaFromSearch.ts (già esistente), per un
 * Sentiero da cache OSM converte la riga in FoundRouteItem
 * (lib/routeBuilder/foundRoute.ts's foundRouteItemFromCachedTrail) e la fa passare dallo stesso
 * salvataggio del wizard (saveResultItemToGuide) — quota reale arricchita al salvataggio, non qui.
 * La generazione di un percorso su misura resta RouteBuilder.tsx invariato, raggiunta da qui solo
 * via il FAB "Costruisci su misura". Le altre vie (file GPX, da un'attività del diario, link,
 * inserimento manuale) restano un tocco più lontano, dietro "Altri modi" (vedi onOtherWays), non
 * più esposte come card equivalenti sulla stessa schermata.
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

  const [showBuilder, setShowBuilder] = useState(false)
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
      const map = L.map(mapRef.current!).setView(ITALY_CENTER, ITALY_ZOOM)
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

    function pinIcon(color: string, glyph: string, big: boolean) {
      const size = big ? 34 : 28
      return L!.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:${big ? 3 : 2}px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">
          <span style="transform:rotate(45deg);font-size:${big ? 15 : 13}px;line-height:1">${glyph}</span>
        </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      })
    }

    for (const item of metaResults) {
      const color = META_TYPE_CONFIG[item.metaType].color
      const isSelected = selected?.kind === 'meta' && selected.item.id === item.id
      const marker = L.marker([item.latitude, item.longitude], { icon: pinIcon(color, GLYPH[item.metaType], isSelected) })
      marker.on('click', () => { setSelected({ kind: 'meta', item }); setSheetExpanded(false) })
      marker.addTo(layer)
    }

    for (const item of trailResults) {
      const pos = trailLatLon(item)
      if (!pos) continue
      const isSelected = selected?.kind === 'trail' && selected.item.id === item.id
      const marker = L.marker(pos, { icon: pinIcon(META_TYPE_CONFIG.sentiero.color, GLYPH.sentiero, isSelected) })
      marker.on('click', () => { setSelected({ kind: 'trail', item }); setSheetExpanded(false) })
      marker.addTo(layer)
    }
  }, [metaResults, trailResults, selected])

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

  if (showBuilder) return <RouteBuilder onBack={() => setShowBuilder(false)} />

  const totalResults = metaResults.length + trailResults.length
  const showTrailZoomHint = (typeFilter === 'tutto' || typeFilter === 'sentiero') && zoom < TRAILS_MIN_ZOOM

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
          {onOtherWays && (
            <button onClick={() => setShowOtherWays(true)} aria-label="Altri modi per aggiungere un percorso"
              className="w-10 h-10 rounded-full bg-white/95 backdrop-blur shadow-md flex items-center justify-center text-stone-600 hover:text-stone-800 transition-colors shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}
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
          Komoot, stesso di MeteSearchMap.tsx), mai a ogni pan/zoom automatico. ─────────────────── */}
      {dirty && (
        <div className="absolute left-0 right-0 top-[112px] z-10 flex justify-center">
          <button onClick={searchCurrentView} disabled={searching}
            className="flex items-center gap-2 bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg disabled:opacity-70 transition-colors">
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Cerca in quest&apos;area
          </button>
        </div>
      )}

      {showTrailZoomHint && (
        <div className="absolute left-0 right-0 z-10 flex justify-center" style={{ top: dirty ? '158px' : '112px' }}>
          <p className="bg-white/90 backdrop-blur text-stone-500 text-[11px] px-3 py-1.5 rounded-full shadow border border-stone-200">
            Avvicinati per vedere anche i Sentieri
          </p>
        </div>
      )}

      {error && (
        <div className="absolute left-3 right-3 top-[160px] z-10 bg-red-500/95 backdrop-blur rounded-xl px-3 py-2 shadow-md text-center">
          <p className="text-xs text-white">{error}</p>
        </div>
      )}

      {/* ── Card di dettaglio sul pin selezionato ───────────────────────── */}
      {selected && (
        <div className="absolute left-3 right-3 z-20" style={{ top: '112px' }}>
          <div className="relative bg-white/95 backdrop-blur rounded-2xl shadow-lg px-4 py-3.5 max-w-sm mx-auto">
            <button onClick={() => setSelected(null)} aria-label="Chiudi"
              className="absolute right-2.5 top-2.5 w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
              <XIcon className="w-3.5 h-3.5" />
            </button>
            {selected.kind === 'meta' ? (
              <MetaDetailCard
                item={selected.item}
                creating={creatingMetaId === selected.item.id}
                onCreate={() => createAndOpen(selected.item)}
              />
            ) : (
              <TrailDetailCard
                item={selected.item}
                saving={savingTrailId === selected.item.id}
                onCreate={() => saveTrail(selected.item)}
              />
            )}
            {selected.kind === 'meta' && metaSaveError && creatingMetaId === null && (
              <p className="text-xs text-red-600 mt-2">{metaSaveError}</p>
            )}
            {selected.kind === 'trail' && trailSaveError && savingTrailId === null && (
              <p className="text-xs text-red-600 mt-2">{trailSaveError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── FAB "Costruisci su misura" — resta un'opzione fra le altre, non più l'unica via. ──── */}
      <button onClick={() => setShowBuilder(true)}
        className="absolute right-4 z-20 w-14 h-14 rounded-full bg-terra-500 hover:bg-terra-600 text-white shadow-lg flex items-center justify-center transition-colors"
        style={{ bottom: '112px' }} title="Costruisci un percorso su misura">
        <RefreshCw className="w-5 h-5" />
      </button>

      {/* ── Foglio risultati — peek sempre visibile, tap per espandere la lista completa. ──────── */}
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
            {metaResults.map(item => (
              <MetaRow key={item.id} item={item} creating={creatingMetaId === item.id} onCreate={() => createAndOpen(item)} onSelect={() => { setSelected({ kind: 'meta', item }); setSheetExpanded(false) }} />
            ))}
            {trailResults.map(item => (
              <TrailRow key={item.id} item={item} saving={savingTrailId === item.id} onCreate={() => saveTrail(item)} onSelect={() => { setSelected({ kind: 'trail', item }); setSheetExpanded(false) }} />
            ))}
          </div>
        )}
      </div>

      {/* ── "Altri modi" — le vie di creazione diverse dalla ricerca su mappa (file GPX, da
          un'attività del diario, link, inserimento manuale), un tocco più lontano invece che card
          equivalenti sulla stessa schermata. */}
      {showOtherWays && onOtherWays && (
        <>
          <div className="fixed inset-0 z-30 bg-stone-900/20" onClick={() => setShowOtherWays(false)} />
          <div className="fixed left-0 right-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,.15)] p-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-stone-800">Altri modi per aggiungere</p>
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

function MetaBadge({ metaType }: { metaType: MetaType }) {
  const cfg = META_TYPE_CONFIG[metaType]
  return (
    <span className="text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-full" style={{ background: `${cfg.color}20`, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function MetaDetailCard({ item, creating, onCreate }: { item: MetaSearchResultItem; creating: boolean; onCreate: () => void }) {
  const location = [item.municipality, item.province, item.region].filter(Boolean).join(', ')
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <MetaBadge metaType={item.metaType} />
        {location && <span className="text-[10px] text-stone-400 truncate">{location}</span>}
      </div>
      <p className="font-display text-[15px] font-semibold text-stone-800 mb-2.5 pr-6">{item.name}</p>
      <div className="flex gap-2">
        <a href={`/mete/${encodeURIComponent(item.id)}`} className="flex-1 text-center bg-white border border-stone-200 rounded-lg py-1.5 text-xs font-bold text-stone-600">
          Scheda
        </a>
        <button onClick={onCreate} disabled={creating}
          className="flex-1 flex items-center justify-center gap-1.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 rounded-lg py-1.5 text-xs font-bold text-white transition-colors">
          {creating && <Loader2 className="w-3 h-3 animate-spin" />} Crea guida
        </button>
      </div>
    </div>
  )
}

function TrailDetailCard({ item, saving, onCreate }: { item: TrailNearbyItem; saving: boolean; onCreate: () => void }) {
  const stats = [
    item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km` : null,
    item.elevationGain != null ? `+${Math.round(item.elevationGain)} m` : null,
    item.difficulty ? `SAC ${item.difficulty}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <MetaBadge metaType="sentiero" />
        {stats && <span className="text-[10px] text-stone-400">{stats}</span>}
      </div>
      <p className="font-display text-[15px] font-semibold text-stone-800 mb-2.5 pr-6">{item.name || 'Sentiero senza nome'}</p>
      <button onClick={onCreate} disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 rounded-lg py-1.5 text-xs font-bold text-white transition-colors">
        {saving && <Loader2 className="w-3 h-3 animate-spin" />} Crea guida
      </button>
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
