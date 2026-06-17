'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllPlanned, type PlannedHikeMeta } from '@/lib/plannedStore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarDays, BookOpenCheck } from 'lucide-react'

function PolyThumb({ poly }: { poly: [number, number][] }) {
  const lats = poly.map(p => p[0]), lons = poly.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const W = 48, H = 48, pad = 5
  const scLat = (H - 2 * pad) / (maxLat - minLat || 0.001)
  const scLon = (W - 2 * pad) / (maxLon - minLon || 0.001)
  const sc   = Math.min(scLat, scLon)
  const offX = pad + ((W - 2 * pad) - (maxLon - minLon) * sc) / 2
  const offY = pad + ((H - 2 * pad) - (maxLat - minLat) * sc) / 2
  const step  = Math.max(1, Math.ceil(poly.length / 60))
  const pts   = poly.filter((_, i) => i % step === 0)
  const d     = pts.map(([lat, lon], i) => `${i === 0 ? 'M' : 'L'} ${(offX + (lon - minLon) * sc).toFixed(1)} ${(offY + (maxLat - lat) * sc).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0">
      <path d={d} fill="none" stroke="#AED4EC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CompactCard({ hike, selected }: { hike: PlannedHikeMeta; selected: boolean }) {
  const poly = (hike.routePolyline ?? []) as [number, number][]

  return (
    <Link
      href={`/guida/${encodeURIComponent(hike.id)}`}
      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-stone-50 transition-colors border-l-2"
      style={{
        borderLeftColor: selected ? '#1C5F8A' : 'transparent',
        background: selected ? '#EAF4FB' : undefined,
      }}
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden relative" style={{ background: '#0D3B5E' }}>
        {poly.length > 1 ? (
          <PolyThumb poly={poly} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CalendarDays className="w-4 h-4" style={{ color: '#AED4EC' }} />
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] font-semibold leading-tight truncate"
          style={{ color: selected ? '#0D3B5E' : '#374151', fontFamily: "'Lora', serif" }}
        >
          {hike.title ?? 'Escursione'}
        </p>
        <p className="text-[10px] text-stone-400 mt-0.5">
          {hike.plannedDate
            ? format(new Date(hike.plannedDate), "d MMM yyyy", { locale: it })
            : 'Data da definire'}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-stone-400">
            {((hike.distanceMeters ?? 0) / 1000).toFixed(1)} km
          </span>
          {hike.cachedGuide && (
            <BookOpenCheck className="w-2.5 h-2.5" style={{ color: '#2983C1' }} />
          )}
        </div>
      </div>
    </Link>
  )
}

export default function PianificazioneSidebar({ selected }: { selected?: string }) {
  const [hikes, setHikes] = useState<PlannedHikeMeta[]>([])

  useEffect(() => {
    getAllPlanned().then(plans => {
      setHikes(
        [...plans].sort((a, b) => {
          if (a.plannedDate && b.plannedDate) return new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime()
          if (a.plannedDate) return -1
          if (b.plannedDate) return 1
          return 0
        })
      )
    })
  }, [])

  return (
    <aside className="hidden md:flex md:flex-col md:w-72 md:shrink-0 md:border-r md:border-stone-200 md:bg-white md:sticky md:top-14 md:h-[calc(100vh-56px)] md:overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 px-3 py-3 border-b border-stone-100 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4" style={{ color: '#1C5F8A' }} />
          <span className="text-[12px] font-bold uppercase tracking-[1.5px]" style={{ color: '#0D3B5E' }}>
            Pianificate
          </span>
        </div>
        <span className="text-[11px] font-semibold" style={{ color: '#8a7f6e' }}>
          {hikes.length} esc.
        </span>
      </div>

      {/* List */}
      <div className="flex-1 divide-y divide-stone-50">
        {hikes.map(h => (
          <CompactCard key={h.id} hike={h} selected={h.id === selected} />
        ))}
        {hikes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-stone-400">
            <CalendarDays className="w-8 h-8 opacity-30" />
            <p className="text-xs text-center">Nessuna escursione pianificata</p>
          </div>
        )}
      </div>
    </aside>
  )
}
