'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllActivities, type ActivityMeta } from '@/lib/blobStore'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { BookOpen, Route } from 'lucide-react'
import { ctsLabel } from '@/lib/trailScore'

function CompactCard({ activity, selected }: { activity: ActivityMeta; selected: boolean }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    try {
      const coverId = localStorage.getItem(`dtrek_cover_${activity.id}`)
      const raw = localStorage.getItem(`dtrek_vp_${activity.id}`)
      if (raw) {
        const photos = JSON.parse(raw) as { id: string; dataUrl: string }[]
        const photo = (coverId ? photos.find(p => p.id === coverId) : null) ?? photos[0]
        if (photo?.dataUrl) setCoverUrl(photo.dataUrl)
      }
    } catch { /* localStorage non disponibile */ }
  }, [activity.id])

  const cts     = (activity as ActivityMeta & { trailScore?: number }).trailScore != null
    ? Math.round((activity as ActivityMeta & { trailScore?: number }).trailScore!)
    : null
  const ctsInfo = cts != null ? ctsLabel(cts) : null
  const poly    = (activity.routePolyline ?? []) as [number, number][]

  return (
    <Link
      href={`/resoconto/${encodeURIComponent(activity.id)}`}
      className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-stone-50 transition-colors border-l-2"
      style={{
        borderLeftColor: selected ? '#2d5c38' : 'transparent',
        background: selected ? '#F0F7F1' : undefined,
      }}
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden relative" style={{ background: '#1a3320' }}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : poly.length > 1 ? (
          <PolyThumb poly={poly} color="#7fd491" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Route className="w-4 h-4" style={{ color: '#7fd491' }} />
          </div>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[12px] font-semibold leading-tight truncate"
          style={{ color: selected ? '#1a3320' : '#374151', fontFamily: "'Lora', serif" }}
        >
          {activity.title ?? 'Escursione'}
        </p>
        <p className="text-[10px] text-stone-400 mt-0.5">
          {format(new Date(activity.startTime), "d MMM yyyy", { locale: it })}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-stone-400">
            {(activity.distanceMeters / 1000).toFixed(1)} km
          </span>
          {cts != null && (
            <span
              className="text-[9px] font-bold px-1 py-0.5 rounded"
              style={{ background: ctsInfo?.color ?? '#4a9e5c', color: 'white' }}
            >
              {cts}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function PolyThumb({ poly, color }: { poly: [number, number][]; color: string }) {
  const lats = poly.map(p => p[0]), lons = poly.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const W = 48, H = 48, pad = 5
  const scLat = (H - 2 * pad) / (maxLat - minLat || 0.001)
  const scLon = (W - 2 * pad) / (maxLon - minLon || 0.001)
  const sc = Math.min(scLat, scLon)
  const offX = pad + ((W - 2 * pad) - (maxLon - minLon) * sc) / 2
  const offY = pad + ((H - 2 * pad) - (maxLat - minLat) * sc) / 2
  const step  = Math.max(1, Math.ceil(poly.length / 60))
  const pts   = poly.filter((_, i) => i % step === 0)
  const d     = pts.map(([lat, lon], i) => `${i === 0 ? 'M' : 'L'} ${(offX + (lon - minLon) * sc).toFixed(1)} ${(offY + (maxLat - lat) * sc).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function DiarioSidebar({ selected }: { selected?: string }) {
  const [activities, setActivities] = useState<ActivityMeta[]>([])

  useEffect(() => {
    getAllActivities().then(acts => {
      setActivities(
        [...acts].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      )
    })
  }, [])

  return (
    <aside className="hidden md:flex md:flex-col md:w-72 md:shrink-0 md:border-r md:border-stone-200 md:bg-white md:sticky md:top-14 md:h-[calc(100vh-56px)] md:overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 px-3 py-3 border-b border-stone-100 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4" style={{ color: '#2d5c38' }} />
          <span className="text-[12px] font-bold uppercase tracking-[1.5px]" style={{ color: '#1a3320' }}>
            Diario
          </span>
        </div>
        <span className="text-[11px] font-semibold" style={{ color: '#8a7f6e' }}>
          {activities.length} {activities.length === 1 ? 'esc.' : 'esc.'}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 divide-y divide-stone-50">
        {activities.map(a => (
          <CompactCard key={a.id} activity={a} selected={a.id === selected} />
        ))}
        {activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-stone-400">
            <BookOpen className="w-8 h-8 opacity-30" />
            <p className="text-xs text-center">Nessuna escursione</p>
          </div>
        )}
      </div>
    </aside>
  )
}
