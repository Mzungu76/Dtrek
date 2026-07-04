'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Mountain, ArrowUpDown } from 'lucide-react'
import RouteThumb from '@/components/RouteThumb'
import type { HubMode, RouteHubItem, SortValues } from './types'

type SortKey = 'date' | 'km' | 'dplus' | 'cts' | 'rating'

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'date', label: 'Data' }, { id: 'km', label: 'Km' }, { id: 'dplus', label: 'D+' },
  { id: 'rating', label: 'Voto' }, { id: 'cts', label: 'CTS' },
]

const SORT_CMP: Record<SortKey, (a: SortValues, b: SortValues) => number> = {
  date:   (a, b) => b.date - a.date,
  km:     (a, b) => b.km - a.km,
  dplus:  (a, b) => b.dplus - a.dplus,
  cts:    (a, b) => (b.cts ?? -1) - (a.cts ?? -1),
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
}

// Mappa 2D statica (no drag/zoom) per il quadrato di galleria — mostra le tile
// reali invece dello schema stilizzato, montata solo quando il quadrato entra
// (quasi) in vista per non creare troppe istanze Leaflet in una lista lunga.
function GalleryMapThumb({ polyline }: { polyline?: [number, number][] }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null)
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
    import('leaflet').then(L => {
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, {
        zoomControl: false, dragging: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, attributionControl: false,
      })
      mapInstance.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      const line = L.polyline(polyline, { color: '#7dd3fc', weight: 4, opacity: 0.95 }).addTo(map)
      map.fitBounds(line.getBounds(), { padding: [4, 4] })
    })
    return () => {
      cancelled = true
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
    </div>
  )
}

interface Props {
  mode: HubMode
  items: RouteHubItem[]
  currentId: string
  onSelect: (index: number) => void
}

export default function BottomGallery({ mode, items, currentId, onSelect }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('date')
  const hasSortData = items.some(i => i.sortValues)

  const others = useMemo(() => {
    const list = items.map((item, i) => ({ item, i })).filter(({ item }) => item.id !== currentId)
    if (!hasSortData) return list
    return [...list].sort((a, b) => SORT_CMP[sortBy](
      a.item.sortValues ?? { date: 0, km: 0, dplus: 0 },
      b.item.sortValues ?? { date: 0, km: 0, dplus: 0 },
    ))
  }, [items, currentId, sortBy, hasSortData])

  if (others.length === 0) return null

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
      {hasSortData && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 mb-2" style={{ scrollbarWidth: 'none' }}>
          <ArrowUpDown className="w-3 h-3 text-white/50 shrink-0" />
          {SORT_OPTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md transition-colors ${
                sortBy === s.id ? 'bg-white text-stone-800 border-white' : 'bg-black/40 text-stone-200 border-white/20'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2.5 overflow-x-auto px-4" style={{ scrollSnapType: 'x proximity' }}>
        {others.map(({ item, i }) => (
          <button
            key={item.id}
            onClick={() => onSelect(i)}
            className="shrink-0 w-16 h-16 rounded-2xl overflow-hidden relative border-[1.5px] border-white/35"
            style={{ scrollSnapAlign: 'start' }}
          >
            {mode === 'guida' ? (
              <GalleryMapThumb polyline={item.polyline} />
            ) : item.coverPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.coverPhotoUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-forest-800 to-forest-950 flex items-center justify-center">
                <Mountain className="w-5 h-5 text-white/40" />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 px-1.5 pb-1 pt-3 bg-gradient-to-t from-black/75 to-transparent">
              <span className="block text-[9px] font-bold text-white truncate leading-tight">{item.title}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
