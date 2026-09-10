'use client'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref, type ReactNode } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import type { RouteHubItem, SectionKind, TabDef, PrimaryAction } from './types'

// Symmetric to RouteCarousel's OPEN_DRAG_DISTANCE_PX — how far the header handle must be dragged
// down to fully close, interpolated live so the drag-down mirrors the drag-up-to-open exactly.
const CLOSE_DRAG_DISTANCE_PX = 220
const DRAG_LOCK_PX = 8

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (el: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') ref(el)
      else (ref as { current: T | null }).current = el
    }
  }
}

const CTA_VARIANTS = {
  terra: 'bg-terra-500 text-white',
  glass: 'bg-white text-stone-700 border border-stone-200',
} as const

interface Props {
  item: RouteHubItem
  onRequestClose: () => void
  /** Live progress while dragging the header handle down — 1 (fully open) → 0 (fully closed),
   *  mirroring RouteCarousel's onOpenDragMove so both gestures share one continuous scale. */
  onCloseDragMove: (progress: number) => void
  onCloseDragEnd: (progress: number, velocityPxPerMs: number) => void
  bodyMode: 'continuous' | 'tabbed'
  tabs?: TabDef[]
  activeTab: SectionKind
  onTabChange: (section: SectionKind) => void
  renderSection: (section: SectionKind, item: RouteHubItem, onClose: () => void) => ReactNode
  tabScrollRef?: (section: SectionKind) => Ref<HTMLDivElement> | undefined
  primaryAction: PrimaryAction | null
  headerActions?: ReactNode
  heroPhotos?: ReactNode
}

/**
 * Screen 2 — full page shared by Guida ("continuous": one scroll hosting the magazine guide) and
 * Resoconto ("tabbed": the same pill tab-bar + swipe-between-tabs this used to have as a
 * Google-Maps-style bottom sheet, RouteSheet.tsx — now just hosted in a full page instead of a
 * resizable card). The header handle doubles as the drag-down-to-close gesture, symmetric to the
 * drag-up-to-open one on the closed card (RouteCarousel).
 */
export default function RoutePage({
  item, onRequestClose, onCloseDragMove, onCloseDragEnd, bodyMode, tabs = [], activeTab, onTabChange,
  renderSection, tabScrollRef, primaryAction, headerActions, heroPhotos,
}: Props) {
  const [toolsOpen, setToolsOpen] = useState(false)

  // ── Drag-down-to-close on the header handle (tap = instant close, drag = live progress) ──────
  const closeStartY = useRef(0)
  const closeStartTime = useRef(0)
  const closeDragging = useRef(false)
  const closeActive = useRef(false)
  const lastCloseDy = useRef(0)

  const handleClosePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    closeStartY.current = e.clientY
    closeStartTime.current = performance.now()
    closeDragging.current = false
    closeActive.current = true
    lastCloseDy.current = 0
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleClosePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!closeActive.current) return
    const dy = e.clientY - closeStartY.current
    lastCloseDy.current = dy
    if (!closeDragging.current) {
      if (Math.abs(dy) < DRAG_LOCK_PX) return
      closeDragging.current = true
    }
    onCloseDragMove(clamp(1 - Math.max(0, dy) / CLOSE_DRAG_DISTANCE_PX, 0, 1))
  }
  const handleClosePointerUp = () => {
    if (!closeActive.current) return
    const wasDragging = closeDragging.current
    closeActive.current = false
    closeDragging.current = false
    if (!wasDragging) { onRequestClose(); return }
    const dy = Math.max(0, lastCloseDy.current)
    const elapsedMs = Math.max(1, performance.now() - closeStartTime.current)
    onCloseDragEnd(clamp(1 - dy / CLOSE_DRAG_DISTANCE_PX, 0, 1), dy / elapsedMs)
  }

  // ── Tabbed body: pill tab-bar + hand-rolled swipe between panels (ported from RouteSheet) ────
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === activeTab))
  const TAB_AXIS_LOCK_PX = 8
  const TAB_SWIPE_THRESHOLD_PX = 50
  const [tabDragging, setTabDragging] = useState(false)
  const [tabDeltaPx, setTabDeltaPx] = useState(0)
  const tabStartX = useRef(0)
  const tabStartY = useRef(0)
  const tabLastX = useRef(0)
  const tabLastY = useRef(0)
  const tabAxis = useRef<'none' | 'x' | 'y' | 'innerX'>('none')
  const tabActive = useRef(false)
  const activePanelRef = useRef<HTMLDivElement | null>(null)
  const innerHScrollRef = useRef<HTMLElement | null>(null)

  const handleTabPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    tabStartX.current = e.clientX
    tabStartY.current = e.clientY
    tabAxis.current = 'none'
    tabActive.current = true
    innerHScrollRef.current = (e.target as HTMLElement).closest<HTMLElement>('[data-hscroll]')
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleTabPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!tabActive.current) return
    const dx = e.clientX - tabStartX.current
    const dy = e.clientY - tabStartY.current
    if (tabAxis.current === 'none') {
      if (Math.abs(dx) < TAB_AXIS_LOCK_PX && Math.abs(dy) < TAB_AXIS_LOCK_PX) return
      const horizontal = Math.abs(dx) >= Math.abs(dy)
      tabAxis.current = horizontal ? (innerHScrollRef.current ? 'innerX' : 'x') : 'y'
      if (tabAxis.current === 'x') setTabDragging(true)
      tabLastX.current = e.clientX
      tabLastY.current = e.clientY
    }
    if (tabAxis.current === 'y') {
      activePanelRef.current?.scrollBy({ top: tabLastY.current - e.clientY })
      tabLastY.current = e.clientY
      return
    }
    if (tabAxis.current === 'innerX') {
      innerHScrollRef.current?.scrollBy({ left: tabLastX.current - e.clientX })
      tabLastX.current = e.clientX
      return
    }
    const atEdge = (dx > 0 && activeIndex === 0) || (dx < 0 && activeIndex === tabs.length - 1)
    setTabDeltaPx(atEdge ? dx / 3 : dx)
  }
  const handleTabPointerUp = () => {
    if (tabAxis.current === 'x') {
      if (tabDeltaPx < -TAB_SWIPE_THRESHOLD_PX && activeIndex < tabs.length - 1) onTabChange(tabs[activeIndex + 1].key)
      else if (tabDeltaPx > TAB_SWIPE_THRESHOLD_PX && activeIndex > 0) onTabChange(tabs[activeIndex - 1].key)
    }
    setTabDragging(false)
    setTabDeltaPx(0)
    tabAxis.current = 'none'
    tabActive.current = false
    innerHScrollRef.current = null
  }

  const pillBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pillBarRef.current?.querySelector<HTMLElement>(`[data-tab-key="${activeTab}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [activeTab])

  return (
    <div className="absolute inset-0 flex flex-col bg-[#fdfcfa]">
      {/* Header — fixed height, in-flow (not overlapping the scroll area below), so the body's
          own sticky elements (e.g. GuideReader's section pin-nav) stick right under it instead
          of being hidden behind it. */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3 z-20 relative">
        <button
          onPointerDown={handleClosePointerDown}
          onPointerMove={handleClosePointerMove}
          onPointerUp={handleClosePointerUp}
          onPointerCancel={handleClosePointerUp}
          aria-label="Chiudi"
          className="shrink-0 w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 touch-none cursor-grab active:cursor-grabbing"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <p className="flex-1 min-w-0 truncate font-display text-base font-bold text-stone-900">{item.title}</p>
        <div className="flex items-center gap-2 shrink-0">
          {headerActions}
          {bodyMode === 'continuous' && (
            <button
              onClick={() => setToolsOpen(true)}
              aria-label="Strumenti"
              className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-600"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {bodyMode === 'continuous' ? (
        <div className="flex-1 overflow-y-auto pb-28">
          {renderSection('featured', item, onRequestClose)}
        </div>
      ) : (
        <>
          <div
            ref={pillBarRef}
            className="shrink-0 flex gap-1.5 px-4 pb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
          >
            {tabs.map(t => (
              <button
                key={t.key}
                data-tab-key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`relative shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeTab === t.key ? 'bg-terra-500 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
                {t.badge}
              </button>
            ))}
          </div>

          <div
            className="flex-1 overflow-hidden"
            style={{ touchAction: 'none' }}
            onPointerDown={handleTabPointerDown}
            onPointerMove={handleTabPointerMove}
            onPointerUp={handleTabPointerUp}
            onPointerCancel={handleTabPointerUp}
          >
            <div
              className="flex h-full"
              style={{
                transform: `translateX(calc(${-activeIndex * 100}% + ${tabDeltaPx}px))`,
                transition: tabDragging ? 'none' : 'transform 0.32s cubic-bezier(.2,.8,.2,1)',
              }}
            >
              {tabs.map((t, i) => (
                <div key={t.key} className="w-full h-full shrink-0">
                  {/* Only the active tab and its immediate neighbors ever mount their content —
                      renderSection can be expensive (maps, wiki fetches…) and every tab mounting
                      at once would fire all of it regardless of what's ever viewed. */}
                  {Math.abs(i - activeIndex) <= 1 && (
                    <div
                      ref={mergeRefs(tabScrollRef?.(t.key), i === activeIndex ? activePanelRef : undefined)}
                      className="h-full overflow-y-auto pb-28 md:max-w-2xl md:mx-auto"
                    >
                      {heroPhotos}
                      {renderSection(t.key, item, onRequestClose)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {primaryAction && (
        <button
          onClick={primaryAction.onClick}
          className={`fixed z-30 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] right-4 flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-transform hover:scale-[1.03] ${CTA_VARIANTS[primaryAction.variant]}`}
        >
          <primaryAction.icon className="w-4 h-4" />
          {primaryAction.label}
          {primaryAction.badge}
        </button>
      )}

      {toolsOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-label="Strumenti">
          <div className="absolute inset-0 bg-black/40" onClick={() => setToolsOpen(false)} />
          <div className="absolute inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-stone-200">
              <p className="font-display text-sm font-bold text-stone-800">Strumenti</p>
              <button onClick={() => setToolsOpen(false)} aria-label="Chiudi" className="w-8 h-8 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderSection('strumenti', item, () => setToolsOpen(false))}
          </div>
        </div>
      )}
    </div>
  )
}
