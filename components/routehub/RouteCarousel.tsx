'use client'
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { RouteHubItem } from './types'

interface Props {
  items: RouteHubItem[]
  index: number
  dragging: boolean
  dragDeltaPx: number
  onDragStart: () => void
  onDragMove: (deltaPx: number) => void
  onDragEnd: () => void
  /** False while Screen 2's sheet is open — the carousel stops capturing pointer gestures
   *  entirely so the map underneath the current slide can be freely panned/zoomed. */
  swipeEnabled?: boolean
  /** Slides within index±1 render full content; others get a cheap placeholder — caller decides via `inWindow`. */
  renderSlide: (item: RouteHubItem, i: number, inWindow: boolean) => ReactNode
}

export default function RouteCarousel({ items, index, dragging, dragDeltaPx, onDragStart, onDragMove, onDragEnd, swipeEnabled = true, renderSlide }: Props) {
  const startX = useRef(0)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled) return
    startX.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
    onDragStart()
  }
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled || !dragging) return
    onDragMove(e.clientX - startX.current)
  }
  const handlePointerUp = () => { if (swipeEnabled && dragging) onDragEnd() }

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${swipeEnabled ? 'touch-pan-y cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(calc(${-index * 100}% + ${dragDeltaPx}px))`,
          transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {items.map((item, i) => (
          <div key={item.id} className="w-full h-full shrink-0 relative">
            {renderSlide(item, i, Math.abs(i - index) <= 1)}
          </div>
        ))}
      </div>
    </div>
  )
}
