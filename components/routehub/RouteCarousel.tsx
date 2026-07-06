'use client'
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { RouteHubItem } from './types'

// Below this, a touch/mouse move is still "undecided" — neither a horizontal route-swipe nor a
// vertical open-sheet drag commits until the gesture clears this many px in one direction.
const AXIS_LOCK_PX = 8
// Vertical distance (px, upward) that commits to opening the sheet.
const OPEN_THRESHOLD_PX = 56

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
  /** Dragging the closed card upward past OPEN_THRESHOLD_PX opens Screen 2. */
  onOpenSheet?: () => void
  /** Slides within index±1 render full content; others get a cheap placeholder — caller decides via `inWindow`. */
  renderSlide: (item: RouteHubItem, i: number, inWindow: boolean) => ReactNode
}

export default function RouteCarousel({ items, index, dragging, dragDeltaPx, onDragStart, onDragMove, onDragEnd, swipeEnabled = true, onOpenSheet, renderSlide }: Props) {
  const startX = useRef(0)
  const startY = useRef(0)
  // 'none' while the gesture direction is still undecided (within AXIS_LOCK_PX of the start
  // point) — locks to 'x' (route swipe) or 'y' (open-sheet drag) on the first move past it.
  const axis = useRef<'none' | 'x' | 'y'>('none')
  const opened = useRef(false)

  const reset = () => { axis.current = 'none'; opened.current = false }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled) return
    startX.current = e.clientX
    startY.current = e.clientY
    reset()
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled || opened.current) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    if (axis.current === 'none') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') onDragStart()
    }
    if (axis.current === 'x') {
      onDragMove(dx)
    } else if (dy < -OPEN_THRESHOLD_PX) {
      opened.current = true
      onOpenSheet?.()
    }
  }
  const handlePointerUp = () => {
    if (axis.current === 'x' && dragging) onDragEnd()
    reset()
  }

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${swipeEnabled ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
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
