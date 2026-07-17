'use client'
import type * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { Mountain, ArrowUpDown, Upload, Star } from 'lucide-react'
import RouteThumb from '@/components/RouteThumb'
import { MiniScoreRing } from '@/components/ScoreRing'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import type { HubMode, RouteHubItem, SortValues } from './types'

// Dimensione del badge a doppio anello nella miniatura di galleria (80×80px) — più grande del
// vecchio MiniScoreRing (22px) perché due anelli concentrici hanno bisogno di un minimo di spazio
// per restare leggibili, ma comunque compatta per non dominare la miniatura. Alzata da 30 a 36 —
// a 30 il numero al centro risultava poco leggibile anche col font-size aumentato nel componente.
const GALLERY_GAUGE_SIZE = 36

export type SortKey = 'date' | 'km' | 'dplus' | 'cts' | 'rating' | 'distance'

// Guida can sort/preview by Trail Score (a route not yet hiked has no personal vote); Resoconto
// by the user's own vote (a computed score matters less once the hike is already done). Both
// modes offer "Distanza" (dall'indirizzo salvato nelle impostazioni) once it's known.
export const SORT_OPTIONS_BY_MODE: Record<HubMode, { id: SortKey; label: string }[]> = {
  guida: [
    { id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'cts', label: 'TS' },
    { id: 'distance', label: 'Distanza' },
  ],
  resoconto: [
    { id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' }, { id: 'rating', label: 'Voto' },
    { id: 'distance', label: 'Distanza' },
  ],
}

// Exported so RouteHub can sort the very same `items` array it feeds the carousel — otherwise
// the gallery's order and the swipe order silently disagree the moment the user picks a sort
// other than the list's original load order, and swiping "next" jumps to an unrelated route.
export const SORT_CMP: Record<SortKey, (a: SortValues, b: SortValues) => number> = {
  date:     (a, b) => b.date - a.date,
  km:       (a, b) => b.km - a.km,
  dplus:    (a, b) => b.dplus - a.dplus,
  cts:      (a, b) => (b.cts ?? -1) - (a.cts ?? -1),
  rating:   (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
  // Ascending (nearest first) rather than the descending convention above — for a distance,
  // "closest to home" is the useful default, unlike km/dplus/cts where "most" ranks first.
  distance: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity),
}

function TextBadge({ children }: { children: ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded-md bg-white/90 text-stone-800 text-[9px] font-bold shadow-sm leading-none">
      {children}
    </span>
  )
}

/** The thumbnail's top-left badge mirrors whichever sort is currently active, instead of always
 *  showing the same score — sorting by date shows the date, by distance shows the distance, etc. */
function ThumbBadge({ sortBy, item }: { sortBy: SortKey; item: RouteHubItem }) {
  const sv = item.sortValues
  if (!sv) return null
  switch (sortBy) {
    // Guida: doppio anello (Sicurezza fuori, TS dentro) — vedi components/TrailScoreGaugeBadge.tsx.
    // safetyPreview assente (percorso non ancora aperto/calcolato) disegna comunque l'anello
    // esterno come binario grigio invece di sparire, coerente col resto del badge.
    case 'cts':
      return item.scorePreview
        ? <TrailScoreGaugeBadge total={item.scorePreview.value} safety={item.safetyPreview ?? null} size={GALLERY_GAUGE_SIZE} showLabel={false} />
        : null
    // Resoconto: voto manuale 0-10, un solo valore — resta il cerchio semplice, non ha senso un
    // secondo anello per una Sicurezza che qui non si traccia.
    case 'rating':
      return item.scorePreview
        ? <MiniScoreRing value={item.scorePreview.value} max={item.scorePreview.max} color={item.scorePreview.color} size={22} />
        : null
    case 'date':
      return <TextBadge>{new Date(sv.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</TextBadge>
    case 'km':
      return <TextBadge>{(sv.km / 1000).toFixed(1)} km</TextBadge>
    case 'dplus':
      return <TextBadge>+{Math.round(sv.dplus)} m</TextBadge>
    case 'distance':
      return sv.distance != null ? <TextBadge>~{(sv.distance / 1000).toFixed(0)} km</TextBadge> : null
    default:
      return null
  }
}

// Mappa 2D statica (no drag/zoom) per il quadrato di galleria — mostra le tile
// reali invece dello schema stilizzato, montata solo quando il quadrato entra
// (quasi) in vista per non creare troppe istanze Leaflet in una lista lunga.
function GalleryMapThumb({ polyline }: { polyline?: [number, number][] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<L.Map | null>(null)
  const [nearView, setNearView] = useState(false)

  useEffect(() => {
    if (!wrapRef.current || nearView) return
    const obs = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) { setNearView(true); obs.disconnect() } },
      { rootMargin: '200px' },
    )
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [nearView])

  useEffect(() => {
    if (!nearView || !mapRef.current || !polyline || polyline.length < 2) return
    let cancelled = false
    let observer: ResizeObserver | null = null
    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, {
        zoomControl: false, dragging: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, attributionControl: false,
      })
      mapInstance.current = map
      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', { maxZoom: 19 }).addTo(map)
      const line = L.polyline(polyline, { color: '#7dd3fc', weight: 4, opacity: 0.95 }).addTo(map)
      const fit = () => map.fitBounds(line.getBounds(), { padding: [4, 4] })
      fit()

      // Stessa correzione di CoverMap.tsx: appena montata via IntersectionObserver (vedi sopra),
      // il quadrato di galleria può non avere ancora la sua dimensione finale — senza questo la
      // mappa carica le tile solo per il riquadro sbagliato misurato a quel momento.
      let raf = 0
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => { if (!cancelled) { map.invalidateSize(); fit() } })
      })
      observer.observe(mapRef.current)
    })
    return () => {
      cancelled = true
      observer?.disconnect()
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }
    }
  }, [nearView, polyline])

  const hasRoute = polyline && polyline.length > 1

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-gradient-to-br from-[#123448] to-[#071824]">
      {!hasRoute && (
        <div className="w-full h-full flex items-center justify-center"><Mountain className="w-5 h-5 text-sky-300/60" /></div>
      )}
      {hasRoute && !nearView && <RouteThumb polyline={polyline!} color="#7dd3fc" strokeWidth={3} />}
      {hasRoute && nearView && <div ref={mapRef} className="absolute inset-0" />}
      {/* Darkens the tile so the colored route stands out more clearly than the raw raster tiles. */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />
    </div>
  )
}

interface Props {
  mode: HubMode
  /** Already in final display order — RouteHub sorts this the same way for the carousel too, so
   *  the gallery's order and the swipe order never disagree. */
  items: RouteHubItem[]
  currentId: string
  onSelect: (index: number) => void
  sortBy: SortKey
  onSortChange: (key: SortKey) => void
  /** Import a new GPX/FIT/TCX — rendered as a dedicated tile ahead of the other routes so it's
   *  always reachable from the gallery, even when there's only one route (and no "others"). */
  importLabel?: string
  onImport?: () => void
  /** Guida-only "Preferiti" filter toggle — additive with sortBy, not part of the SortKey radio
   *  group. Absent (both undefined) hides the star button entirely, e.g. in Resoconto. */
  favoritesFilter?: boolean
  onToggleFavoritesFilter?: () => void
}

export default function BottomGallery({
  mode, items, currentId, onSelect, sortBy, onSortChange, importLabel, onImport,
  favoritesFilter, onToggleFavoritesFilter,
}: Props) {
  const hasSortData = items.some(i => i.sortValues)
  const hasDistance = items.some(i => i.sortValues?.distance != null)
  // "Distanza" stays hidden until the user's saved address has actually been geocoded for at
  // least one item — otherwise it'd be a sort option that visibly does nothing right after import.
  const sortOptions = SORT_OPTIONS_BY_MODE[mode].filter(o => o.id !== 'distance' || hasDistance)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Without this, changing the sort re-orders `items` correctly but the strip stays scrolled
  // wherever the user left it — the new #1 item lands off-screen and the re-sort looks like it
  // silently did nothing.
  useEffect(() => { scrollRef.current?.scrollTo({ left: 0 }) }, [sortBy])

  // Keeps the highlighted (current) thumbnail actually in view when swiping between routes —
  // otherwise it can scroll out of the visible strip and the highlight goes unseen.
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-route-id="${CSS.escape(currentId)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [currentId])

  if (items.length === 0 && !onImport) return null

  return (
    <div>
      {(hasSortData || onToggleFavoritesFilter) && (
        <div className="flex items-center justify-center gap-1.5 overflow-x-auto px-4 mb-2">
          {onToggleFavoritesFilter && (
            <button
              onClick={onToggleFavoritesFilter}
              title="Solo preferiti"
              className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full border backdrop-blur-md transition-colors ${
                favoritesFilter ? 'bg-terra-400 border-terra-300 text-white' : 'bg-black/40 text-stone-200 border-white/20'
              }`}
            >
              <Star className="w-3 h-3" fill={favoritesFilter ? 'currentColor' : 'none'} />
            </button>
          )}
          {hasSortData && <ArrowUpDown className="w-3 h-3 text-white/50 shrink-0" />}
          {sortOptions.map(s => (
            <button
              key={s.id}
              onClick={() => onSortChange(s.id)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md transition-colors ${
                sortBy === s.id ? 'bg-white text-stone-800 border-white' : 'bg-black/40 text-stone-200 border-white/20'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto px-4" style={{ scrollSnapType: 'x proximity' }}>
        {onImport && (
          <button
            onClick={onImport}
            className="shrink-0 w-20 h-20 rounded-2xl overflow-hidden relative border-[1.5px] border-dashed border-white/40 bg-white/10 flex flex-col items-center justify-center gap-0.5 hover:bg-white/15 transition-colors"
            style={{ scrollSnapAlign: 'start' }}
          >
            <Upload className="w-5 h-5 text-white/80" />
            <span className="text-[10px] font-bold text-white/80 leading-tight">{importLabel ?? 'Importa'}</span>
          </button>
        )}
        {items.map((item, i) => {
          const isCurrent = item.id === currentId
          return (
          <button
            key={item.id}
            data-route-id={item.id}
            onClick={() => onSelect(i)}
            className={`shrink-0 w-20 h-20 rounded-2xl overflow-hidden relative ${
              isCurrent ? 'border-[3px] border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.35)]' : 'border-[1.5px] border-white/35'
            }`}
            style={{ scrollSnapAlign: 'start' }}
          >
            {item.coverPhotoUrl ? (
              <>
                <Image src={item.coverPhotoUrl} alt={item.title} fill sizes="80px" className="object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/20 pointer-events-none" />
              </>
            ) : (
              // Nessuna foto ⇒ mappa del percorso, non un placeholder generico — stessa priorità
              // usata per la copertina grande a percorso aperto (vedi cover() in ResocontoHub.tsx e
              // CoverMap in RouteHub.tsx). Guida non ha mai coverPhotoUrl, quindi qui vede sempre
              // la mappa, come prima.
              <GalleryMapThumb polyline={item.polyline} />
            )}
            {hasSortData && (
              <div className="absolute top-1 left-1">
                <ThumbBadge sortBy={sortBy} item={item} />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 px-1.5 pb-1 pt-3 bg-gradient-to-t from-black/75 to-transparent">
              <span className="block text-[10px] font-bold text-white truncate leading-tight">{item.title}</span>
            </div>
          </button>
          )
        })}
      </div>
    </div>
  )
}
