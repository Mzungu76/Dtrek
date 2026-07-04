'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import type { RouteHubItem } from './types'

interface Props {
  item: RouteHubItem
  onClose: () => void
  renderMap: (item: RouteHubItem, activeIndex: number | null) => React.ReactNode
  renderChart: (
    item: RouteHubItem,
    onHover: (index: number | null) => void,
    onActivePoint: (d: { alt: number; kmNum: number } | null) => void,
  ) => React.ReactNode
}

export default function AltimetrySplit({ item, onClose, renderMap, renderChart }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [activePoint, setActivePoint] = useState<{ alt: number; kmNum: number } | null>(null)

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#0b1a24]">
      <div className="relative h-1/2 overflow-hidden">
        {renderMap(item, activeIndex)}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute top-[calc(env(safe-area-inset-top,0px)+16px)] inset-x-4 flex items-center justify-between">
          <p className="font-display text-lg font-bold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{item.title}</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="h-1/2 bg-[#101c26] px-3 pt-3.5 pb-5 flex flex-col">
        <div className="flex items-baseline justify-between px-1.5 pb-2">
          <span className="text-[12px] font-semibold text-stone-300">Profilo altimetrico</span>
          <span className="text-[13px] font-bold text-white">
            {activePoint ? `${Math.round(activePoint.alt)} m · ${activePoint.kmNum.toFixed(1)} km` : '—'}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          {renderChart(item, setActiveIndex, setActivePoint)}
        </div>
      </div>
    </div>
  )
}
