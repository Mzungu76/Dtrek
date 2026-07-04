'use client'
import RouteThumb from '@/components/RouteThumb'
import { Mountain } from 'lucide-react'
import type { HubMode, RouteHubItem } from './types'

interface Props {
  mode: HubMode
  items: RouteHubItem[]
  currentId: string
  onSelect: (index: number) => void
}

export default function BottomGallery({ mode, items, currentId, onSelect }: Props) {
  const others = items.map((item, i) => ({ item, i })).filter(({ item }) => item.id !== currentId)
  if (others.length === 0) return null

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
      <div className="flex gap-2.5 overflow-x-auto px-4" style={{ scrollSnapType: 'x proximity' }}>
        {others.map(({ item, i }) => (
          <button
            key={item.id}
            onClick={() => onSelect(i)}
            className="shrink-0 w-16 h-16 rounded-2xl overflow-hidden relative border-[1.5px] border-white/35"
            style={{ scrollSnapAlign: 'start' }}
          >
            {mode === 'guida' ? (
              <div className="absolute inset-0 bg-gradient-to-br from-[#123448] to-[#071824]">
                {item.polyline && item.polyline.length > 1 ? (
                  <RouteThumb polyline={item.polyline} color="#7dd3fc" strokeWidth={3} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Mountain className="w-5 h-5 text-sky-300/60" /></div>
                )}
              </div>
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
