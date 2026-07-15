'use client'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type ReactNode } from 'react'
import type { RouteHubItem } from './types'

// Below this, a touch/mouse move is still "undecided" — neither a horizontal route-swipe nor a
// vertical open-page drag commits until the gesture clears this many px in one direction.
const AXIS_LOCK_PX = 8
// Vertical drag-up distance (px) that maps to a full 0→1 open progress — see onOpenDragMove.
const OPEN_DRAG_DISTANCE_PX = 220
// Desktop has no touch drag, so a mouse-wheel/trackpad scroll "down" over the closed card stands
// in for dragging it up — one wheel notch (commonly ~100 in Chrome/Windows, less on trackpads/Mac)
// clears this comfortably. Unlike the touch drag, a wheel tick has no natural "distance" to
// interpolate, so it just commits the open in one shot.
const WHEEL_OPEN_PX = 30

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

interface Props {
  items: RouteHubItem[]
  index: number
  /** True for the one render right after a silent index resync (same route, just relocated in
   *  a re-sorted list) — skips the slide transition so it doesn't animate through every route
   *  in between for a change the user never asked for. */
  instant?: boolean
  dragging: boolean
  dragDeltaPx: number
  onDragStart: () => void
  onDragMove: (deltaPx: number) => void
  onDragEnd: () => void
  /** False while Screen 2 is open — the carousel stops capturing pointer gestures entirely. */
  swipeEnabled?: boolean
  /** Fired continuously while dragging the closed card upward — progress 0 (not dragged) to 1
   *  (dragged the full OPEN_DRAG_DISTANCE_PX) — drives the live, finger-following open animation. */
  onOpenDragMove?: (progress: number) => void
  /** Fired on release of a vertical drag — velocity in px/ms (upward = positive), estimated as the
   *  gesture's average speed, so a fast short flick can commit the open even short of progress 1. */
  onOpenDragEnd?: (progress: number, velocityPxPerMs: number) => void
  /** Slides within index±1 render full content; others get a cheap placeholder — caller decides via `inWindow`. */
  renderSlide: (item: RouteHubItem, i: number, inWindow: boolean) => ReactNode
}

export default function RouteCarousel({
  items, index, instant = false, dragging, dragDeltaPx, onDragStart, onDragMove, onDragEnd,
  swipeEnabled = true, onOpenDragMove, onOpenDragEnd, renderSlide,
}: Props) {
  const startX = useRef(0)
  const startY = useRef(0)
  const startTime = useRef(0)
  // 'none' while the gesture direction is still undecided (within AXIS_LOCK_PX of the start
  // point) — locks to 'x' (route swipe) or 'y' (open-page drag) on the first move past it.
  const axis = useRef<'none' | 'x' | 'y'>('none')
  // Without this, a mouse (unlike touch) fires pointermove on plain hover — with no button ever
  // pressed — which was enough to lock an axis and start "dragging" the slide under the cursor
  // on desktop, since nothing else gated the handler on an actual pointerdown having happened.
  const active = useRef(false)

  const reset = () => { axis.current = 'none'; active.current = false }

  // One-shot per "closed" spell: reset whenever Screen 1 becomes interactive again, so the next
  // wheel gesture can open the page again (without this, wheel events keep firing well past the
  // first one that crosses WHEEL_OPEN_PX, calling onOpenDragEnd repeatedly for one gesture).
  const wheelLocked = useRef(false)
  useEffect(() => { wheelLocked.current = false }, [swipeEnabled])
  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!swipeEnabled || wheelLocked.current) return
    if (e.deltaY > WHEEL_OPEN_PX) {
      wheelLocked.current = true
      onOpenDragMove?.(1)
      onOpenDragEnd?.(1, Infinity)
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled) return
    startX.current = e.clientX
    startY.current = e.clientY
    startTime.current = performance.now()
    axis.current = 'none'
    active.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!swipeEnabled || !active.current) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    if (axis.current === 'none') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      axis.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') onDragStart()
    }
    if (axis.current === 'x') {
      onDragMove(dx)
    } else {
      // Only the upward half of the gesture opens the page — dragging back down (without
      // releasing) reports a shrinking progress instead of latching at whatever peak it reached.
      onOpenDragMove?.(clamp(-dy / OPEN_DRAG_DISTANCE_PX, 0, 1))
    }
  }
  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (axis.current === 'x' && dragging) onDragEnd()
    if (axis.current === 'y') {
      const dy = e.clientY - startY.current
      const elapsedMs = Math.max(1, performance.now() - startTime.current)
      const progress = clamp(-dy / OPEN_DRAG_DISTANCE_PX, 0, 1)
      onOpenDragEnd?.(progress, -dy / elapsedMs)
    }
    reset()
  }

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${swipeEnabled ? 'touch-none cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(calc(${-index * 100}% + ${dragDeltaPx}px))`,
          transition: dragging || instant ? 'none' : 'transform 0.32s cubic-bezier(.2,.8,.2,1)',
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
