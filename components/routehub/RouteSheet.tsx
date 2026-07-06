'use client'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type Ref, type ReactNode } from 'react'
import { ChevronDown, Box } from 'lucide-react'
import type { RouteHubItem, SectionKind, TabDef, PrimaryAction } from './types'
import type { SheetSnap } from './useRouteHubState'

const PEEK_PX = 132
/** Header (handle + title/CTA row) + tab-bar, in px — used to size the scrollable content area. */
const CHROME_PX = 108
/** How far below the peek height the handle can be dragged before release — dragging past halfway
 *  through this closes the sheet instead of snapping back to peek, mirroring the drag-up-to-open
 *  gesture on Screen 1. */
const CLOSE_DRAG_PX = 60
/** Desktop equivalent of dragging the handle down to close — a mouse-wheel/trackpad scroll "up"
 *  while hovering the handle itself (never the scrollable tab content below it). */
const WHEEL_CLOSE_PX = 30

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function heightForSnap(snap: SheetSnap): number {
  if (typeof window === 'undefined') return PEEK_PX
  if (snap === 'peek') return PEEK_PX
  if (snap === 'half') return window.innerHeight * 0.55
  return window.innerHeight * 0.88
}

const CTA_VARIANTS = {
  terra: 'bg-terra-500 text-white',
  glass: 'bg-stone-100 text-stone-700 border border-stone-200',
} as const

interface Props {
  item: RouteHubItem
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  onBackToGallery: () => void
  /** Dragging the handle down past CLOSE_DRAG_PX below peek — from any snap point — closes the
   *  sheet and returns to Screen 1, the reverse of dragging the closed card up to open it. */
  onClose: () => void
  tabs: TabDef[]
  activeTab: SectionKind
  onTabChange: (section: SectionKind) => void
  renderTabContent: (section: SectionKind) => ReactNode
  tabScrollRef?: (section: SectionKind) => Ref<HTMLDivElement> | undefined
  primaryAction: PrimaryAction | null
  on3D?: () => void
  mapHeaderActions?: ReactNode
  heroPhotos?: ReactNode
  /** Fired whenever the sheet's own rendered height changes (snap transitions and live drag) —
   *  lets the map underneath re-center on the visible band as the sheet resizes. */
  onHeightChange?: (heightPx: number) => void
}

/**
 * Screen 2 "scheda percorso" — Google-Maps-style bottom sheet with 3 drag snap-points
 * (peek/half/full). Reuses the drag/snap mechanics of components/navigation/NavBottomSheet.tsx.
 * The docking strip (back button + map-view controls) and the header (handle + title + primary
 * CTA) live outside the collapsible area, so they're never covered by the sheet at any snap-point.
 */
export default function RouteSheet({
  item, snap, onSnapChange, onBackToGallery, onClose, tabs, activeTab, onTabChange,
  renderTabContent, tabScrollRef, primaryAction, on3D, mapHeaderActions, heroPhotos, onHeightChange,
}: Props) {
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragStart = useRef<{ y: number; height: number } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = { y: e.clientY, height: heightForSnap(snap) }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const delta = dragStart.current.y - e.clientY
    setDragHeight(clamp(dragStart.current.height + delta, PEEK_PX - CLOSE_DRAG_PX, window.innerHeight * 0.92))
  }
  const handlePointerUp = () => {
    if (!dragStart.current) return
    const current = dragHeight ?? heightForSnap(snap)
    setDragHeight(null)
    dragStart.current = null
    if (current < PEEK_PX - CLOSE_DRAG_PX / 2) { onClose(); return }
    const snapPoints: [SheetSnap, number][] = [
      ['peek', heightForSnap('peek')],
      ['half', heightForSnap('half')],
      ['full', heightForSnap('full')],
    ]
    const nearest = snapPoints.reduce((a, b) => (Math.abs(b[1] - current) < Math.abs(a[1] - current) ? b : a))
    onSnapChange(nearest[0])
  }

  const wheelCloseLocked = useRef(false)
  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (wheelCloseLocked.current) return
    if (e.deltaY < -WHEEL_CLOSE_PX) {
      wheelCloseLocked.current = true
      onClose()
    }
  }

  const currentHeight = dragHeight ?? heightForSnap(snap)

  useEffect(() => { onHeightChange?.(currentHeight) }, [currentHeight]) // eslint-disable-line react-hooks/exhaustive-deps

  // Content swipes between tabs, exactly like swiping routes on Screen 1 — same pointer-drag
  // mechanic as RouteCarousel (translateX + drag delta), not native scroll-snap: a fling on a
  // scroll-snap strip can carry momentum past more than one snap point, moving 2-3 tabs in a
  // single gesture — here one swipe commits to at most one neighboring tab, however hard/fast.
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === activeTab))
  const TAB_AXIS_LOCK_PX = 8
  const TAB_SWIPE_THRESHOLD_PX = 50
  const [tabDragging, setTabDragging] = useState(false)
  const [tabDeltaPx, setTabDeltaPx] = useState(0)
  const tabStartX = useRef(0)
  const tabStartY = useRef(0)
  const tabAxis = useRef<'none' | 'x' | 'y'>('none')
  const tabActive = useRef(false)

  const handleTabPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    tabStartX.current = e.clientX
    tabStartY.current = e.clientY
    tabAxis.current = 'none'
    tabActive.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handleTabPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!tabActive.current) return
    const dx = e.clientX - tabStartX.current
    const dy = e.clientY - tabStartY.current
    if (tabAxis.current === 'none') {
      if (Math.abs(dx) < TAB_AXIS_LOCK_PX && Math.abs(dy) < TAB_AXIS_LOCK_PX) return
      tabAxis.current = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      if (tabAxis.current === 'x') setTabDragging(true)
    }
    if (tabAxis.current !== 'x') return
    // Resistance past the first/last tab instead of a hard stop — confirms there's nothing
    // further that way rather than just silently not moving.
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
  }

  // Keeps the active tab's own pill in view in the pill bar — switching tabs by swiping the
  // content (rather than tapping a pill directly) would otherwise leave the bar scrolled
  // wherever it was, possibly not even showing the tab that's now active.
  const pillBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pillBarRef.current?.querySelector<HTMLElement>(`[data-tab-key="${activeTab}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [activeTab])

  return (
    // pointer-events-none on the root: this div spans the full screen (inset-0) so the map
    // stays pannable through the empty space above the docking strip/sheet — only the actual
    // visible chrome (buttons, sheet card) opts back in with pointer-events-auto below.
    <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
      {/* Docking strip — fixed, independent of the sheet's height, never covered by it. */}
      <div className="relative h-16 shrink-0 pointer-events-none">
        <div className="absolute top-[calc(env(safe-area-inset-top,0px)+16px)] inset-x-4 flex items-center justify-between gap-2">
          <button
            onClick={onBackToGallery}
            aria-label="Torna alla galleria"
            className="pointer-events-auto shrink-0 w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 pointer-events-auto shrink-0 ml-auto">
            {mapHeaderActions}
            {on3D && (
              <button
                onClick={on3D}
                title="Vista 3D"
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/15 text-white text-xs font-semibold"
              >
                <Box className="w-3.5 h-3.5 shrink-0" /> 3D
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className={`relative rounded-t-[28px] bg-[#fdfcfa] border-t border-stone-200 shadow-[0_-8px_32px_rgba(0,0,0,0.25)] overflow-hidden pointer-events-auto ${
          dragHeight === null ? 'transition-[height] duration-200 ease-out' : ''
        }`}
        style={{ height: `${currentHeight}px`, maxHeight: 'calc(100% - 72px)' }}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onClick={() => { if (dragHeight === null) onSnapChange(snap === 'peek' ? 'half' : 'peek') }}
          className="w-full flex flex-col items-center gap-2 pt-2.5 pb-3 px-4 touch-none cursor-grab active:cursor-grabbing select-none"
        >
          <span className="w-10 h-1.5 rounded-full bg-stone-300" />
          <div className="w-full flex items-center justify-between gap-3">
            <p className="flex-1 min-w-0 truncate font-display text-base font-bold text-stone-900">{item.title}</p>
            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                onPointerDown={e => e.stopPropagation()}
                className={`shrink-0 flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-transform hover:scale-[1.03] ${CTA_VARIANTS[primaryAction.variant]}`}
              >
                <primaryAction.icon className="w-4 h-4" />
                {primaryAction.label}
                {primaryAction.badge}
              </button>
            )}
          </div>
          {snap === 'peek' && item.statPills.length > 0 && (
            <div className="w-full flex flex-wrap items-center gap-1.5">
              {item.statPills.slice(0, 3).map(({ icon: Icon, label }) => (
                <span key={label} className="flex items-center gap-1 bg-stone-100 text-stone-700 text-[10px] font-semibold px-2 py-1 rounded-full">
                  <Icon className="w-3 h-3" /> {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {snap !== 'peek' && (
          <>
            {/* touchAction + WebkitOverflowScrolling: nested overflow-x-auto strips inside a
                position:fixed shell (the whole RouteHub root) are the classic case where iOS
                Safari needs these set explicitly, or a horizontal drag across the strip is
                ignored entirely instead of scrolling it — tabs beyond the first screenful would
                then only be reachable by already being visible, never by scrolling to them. */}
            <div
              ref={pillBarRef}
              className="flex gap-1.5 px-4 pb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
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
              className="overflow-hidden"
              style={{ height: `calc(${currentHeight}px - ${CHROME_PX}px)`, touchAction: 'pan-y' }}
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
                        renderTabContent can be expensive (maps, wiki fetches…) and every tab
                        mounting at once would fire all of it regardless of what's ever viewed. */}
                    {Math.abs(i - activeIndex) <= 1 && (
                      <div ref={tabScrollRef?.(t.key)} className="h-full overflow-y-auto md:max-w-2xl md:mx-auto">
                        {heroPhotos}
                        {renderTabContent(t.key)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
