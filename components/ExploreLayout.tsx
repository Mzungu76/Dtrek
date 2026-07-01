'use client'
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronUp } from 'lucide-react'

type SheetState = 'collapsed' | 'half' | 'full'

interface Props {
  map: ReactNode
  panel: ReactNode
  resultsCount: number
  // Bumped by the parent each time a new area search starts — auto-expands the
  // mobile sheet from collapsed to half so progress is visible without a manual drag.
  searchTrigger?: number
}

const COLLAPSED_PX = 56

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

// Coexisting map + results layout, replacing the old "results stacked below a
// 72vh-tall map" pattern that pushed results off-screen on mobile:
// - Desktop: persistent side panel next to the map, scrollable independently.
// - Mobile: results live in a draggable 3-state bottom sheet (collapsed/half/
//   full) that overlays the map instead of following it.
export default function ExploreLayout({ map, panel, resultsCount, searchTrigger }: Props) {
  const [sheetState, setSheetState] = useState<SheetState>('collapsed')
  // Live drag height in px while the handle is being dragged; null once released
  // (snapped back to one of the 3 discrete states, transition animates it).
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragStart = useRef<{ y: number; height: number } | null>(null)

  // Auto-expand from collapsed→half when a new search starts, so progress is
  // visible without requiring a manual drag — still user-collapsible after.
  useEffect(() => {
    if (searchTrigger === undefined) return
    setSheetState(prev => (prev === 'collapsed' ? 'half' : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger])

  function heightForState(state: SheetState): number {
    if (typeof window === 'undefined') return COLLAPSED_PX
    if (state === 'collapsed') return COLLAPSED_PX
    if (state === 'half') return window.innerHeight * 0.5
    return window.innerHeight * 0.9
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragStart.current = { y: e.clientY, height: heightForState(sheetState) }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    const delta = dragStart.current.y - e.clientY // dragging up → taller sheet
    setDragHeight(clamp(dragStart.current.height + delta, COLLAPSED_PX, window.innerHeight * 0.92))
  }

  function handlePointerUp() {
    if (!dragStart.current) return
    const current = dragHeight ?? heightForState(sheetState)
    const snapPoints: [SheetState, number][] = [
      ['collapsed', heightForState('collapsed')],
      ['half', heightForState('half')],
      ['full', heightForState('full')],
    ]
    const nearest = snapPoints.reduce((a, b) => (Math.abs(b[1] - current) < Math.abs(a[1] - current) ? b : a))
    setSheetState(nearest[0])
    setDragHeight(null)
    dragStart.current = null
  }

  function toggleSheet() {
    setSheetState(prev => (prev === 'collapsed' ? 'half' : 'collapsed'))
  }

  const currentHeight = dragHeight ?? heightForState(sheetState)

  return (
    <div className="md:flex md:gap-4 md:items-start">
      <div className="md:flex-1 md:min-w-0">{map}</div>

      {/* Desktop: persistent side panel, independently scrollable */}
      <div className="hidden md:block md:w-[420px] md:shrink-0 md:sticky md:top-20 md:max-h-[calc(100vh-6rem)] md:rounded-2xl md:border md:border-stone-200 md:shadow-sm md:bg-white md:overflow-hidden">
        {panel}
      </div>

      {/* Mobile: draggable bottom sheet — sits above Navbar's fixed bottom tab
          bar (h-16 + safe-area inset), higher z-index than the map's own
          absolute overlays (z-[1000]) so it's never hidden behind them. */}
      <div
        className={`md:hidden fixed left-0 right-0 z-[1100] bg-white rounded-t-2xl shadow-2xl border-t border-stone-200 overflow-hidden ${
          dragHeight === null ? 'transition-[height] duration-200 ease-out' : ''
        }`}
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))', height: `${currentHeight}px` }}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={() => { if (dragHeight === null) toggleSheet() }}
          className="w-full flex flex-col items-center justify-center gap-1 py-2 touch-none cursor-grab active:cursor-grabbing select-none"
        >
          <span className="w-10 h-1 rounded-full bg-stone-300" />
          <span className="flex items-center gap-1 text-xs font-medium text-stone-500">
            {resultsCount > 0 ? `${resultsCount} sentieri trovati` : 'Cerca sentieri'}
            <ChevronUp className={`w-3.5 h-3.5 transition-transform ${sheetState === 'collapsed' ? '' : 'rotate-180'}`} />
          </span>
        </div>
        <div className="overflow-y-auto" style={{ height: `calc(${currentHeight}px - 3rem)` }}>
          {panel}
        </div>
      </div>
    </div>
  )
}
