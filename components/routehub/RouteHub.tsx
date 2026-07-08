'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useRouteHubState } from './useRouteHubState'
import RouteCarousel from './RouteCarousel'
import RoutePage from './RoutePage'
import CoverMap from './CoverMap'
import TopOverlay from './TopOverlay'
import BottomGallery, { SORT_CMP, type SortKey } from './BottomGallery'
import type { RouteHubProps, SectionKind } from './types'

// Shared duration for the Screen1 ⇄ Screen2 cross-dissolve, both directions, whenever the
// transition isn't being driven live by a drag (dragLive === true skips it entirely so the page
// follows the finger 1:1 with no lag).
const SHEET_TRANSITION_MS = 220
// How far (px) the incoming page rises as it fades in/out — a small nudge, not a full slide, so
// the gesture reads as "dissolve while lifting" rather than a hard slide transition.
const OPEN_TRANSLATE_PX = 28
// Progress (0..1) an open/close drag must clear to commit, if it doesn't clear this on speed alone.
const COMMIT_THRESHOLD = 0.45
// px/ms — a flick faster than this commits the gesture even if it stopped short of the threshold.
const FLING_VELOCITY = 0.9

export default function RouteHub({
  mode, items, initialIndex, onIndexChange, bodyMode, tabs = [], renderSection,
  tabScrollRef, primaryAction, summaryBanner, weatherIcon, onSectionChange,
  scoreBadges, scoreBadgesTargetSection, heroPhotos, headerActions, importLabel, onImport,
  subtitle, topOverlayVariant,
}: RouteHubProps) {
  const [state, dispatch] = useRouteHubState(initialIndex)
  const [sortBy, setSortBy] = useState<SortKey>('date')
  const isOpen = state.openSection != null

  const defaultSection: SectionKind = bodyMode === 'continuous' ? 'featured' : (tabs[0]?.key ?? 'dati')

  // Continuous "how open is Screen 2" value (0 closed → 1 fully open), driven live by whichever
  // drag is in progress (open-drag on the closed card, close-drag on the open page's header) and
  // settled by CSS transition otherwise — this is what makes the open/close dissolve smoothly
  // instead of cutting or sliding abruptly.
  const [openProgress, setOpenProgress] = useState(0)
  const [dragLive, setDragLive] = useState(false)

  // Keeps openProgress in sync whenever openSection flips through a path that doesn't go through
  // the animated helpers below (e.g. JUMP_TO closing it as a safety net while swiping routes).
  useEffect(() => {
    if (dragLive) return
    setOpenProgress(isOpen ? 1 : 0)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const openWithAnimation = (section: SectionKind) => {
    setDragLive(false)
    setOpenProgress(1)
    dispatch({ type: 'OPEN_SECTION', section })
  }
  const handleOpenDragMove = (progress: number) => { setDragLive(true); setOpenProgress(progress) }
  const handleOpenDragEnd = (progress: number, velocityPxPerMs: number) => {
    setDragLive(false)
    if (progress >= COMMIT_THRESHOLD || velocityPxPerMs >= FLING_VELOCITY) {
      setOpenProgress(1)
      dispatch({ type: 'OPEN_SECTION', section: defaultSection })
    } else {
      setOpenProgress(0)
    }
  }
  const handleCloseDragMove = (progress: number) => { setDragLive(true); setOpenProgress(progress) }
  const handleCloseDragEnd = (progress: number, velocityPxPerMs: number) => {
    setDragLive(false)
    if (progress <= 1 - COMMIT_THRESHOLD || velocityPxPerMs >= FLING_VELOCITY) {
      setOpenProgress(0)
      dispatch({ type: 'CLOSE_SECTION' })
    } else {
      setOpenProgress(1)
    }
  }
  const handleRequestClose = () => {
    setDragLive(false)
    setOpenProgress(0)
    dispatch({ type: 'CLOSE_SECTION' })
  }

  // Keeps RoutePage mounted while any part of the open animation is live (including the tail end
  // of a close fade-out) instead of vanishing the instant openSection goes null.
  const [pageMounted, setPageMounted] = useState(false)
  useEffect(() => {
    if (isOpen || openProgress > 0) { setPageMounted(true); return }
    const t = setTimeout(() => setPageMounted(false), SHEET_TRANSITION_MS)
    return () => clearTimeout(t)
  }, [isOpen, openProgress])

  // While closing, openSection is already null but the fading-out page still needs a tab/section
  // to render — keeps showing whatever was last open instead of falling back to nothing.
  const lastSection = useRef<SectionKind>(defaultSection)
  if (state.openSection) lastSection.current = state.openSection

  // Notifies the caller of which section is open (or none) so it can derive section-specific
  // state (highlighted POI/difficulty index, POI layer visibility…) without lifting this reducer out.
  useEffect(() => { onSectionChange?.(state.openSection) }, [state.openSection]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced URL sync — settles ~150ms after the index stops changing so a fast
  // multi-swipe doesn't spam router.replace calls. Skips the very first run: on mount
  // state.index already equals initialIndex (the caller derived it from the same item), so
  // notifying then would just re-run the caller's data fetch for no reason.
  const indexChangeTimer = useRef<ReturnType<typeof setTimeout>>()
  const skippedFirstRun = useRef(false)
  useEffect(() => {
    if (!onIndexChange || items.length === 0) return
    if (!skippedFirstRun.current) { skippedFirstRun.current = true; return }
    clearTimeout(indexChangeTimer.current)
    indexChangeTimer.current = setTimeout(() => {
      const item = sortedItems[state.index]
      if (item) onIndexChange(item, state.index)
    }, 150)
    return () => clearTimeout(indexChangeTimer.current)
  }, [state.index]) // eslint-disable-line react-hooks/exhaustive-deps

  // The gallery and the carousel must swipe through the very same order — otherwise picking a
  // sort other than "Data" leaves the gallery reordered while swiping still steps through the
  // original load order, and "next" jumps to a route unrelated to what's actually next by the
  // chosen sort.
  const hasSortData = items.some(i => i.sortValues)
  const sortedItems = useMemo(() => {
    if (!hasSortData) return items
    return [...items].sort((a, b) => SORT_CMP[sortBy](
      a.sortValues ?? { date: 0, km: 0, dplus: 0 },
      b.sortValues ?? { date: 0, km: 0, dplus: 0 },
    ))
  }, [items, sortBy, hasSortData])

  // `sortedItems` can reorder for two very different reasons: the user picking a different sort
  // (handleSortChange below), or a route's own score/date/etc. quietly updating live. Either way,
  // `state.index` must keep pointing at the SAME route, not whatever numeric slot it used to
  // occupy — currentRouteId tracks intent; the layout effect re-derives the index from that id
  // every time the order changes.
  const currentRouteId = useRef<string | null>(null)
  useEffect(() => { currentRouteId.current = sortedItems[state.index]?.id ?? currentRouteId.current }, [state.index]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const id = currentRouteId.current
    if (id == null) return
    const idx = sortedItems.findIndex(it => it.id === id)
    if (idx >= 0 && idx !== state.index) dispatch({ type: 'JUMP_TO', index: idx })
  }, [sortedItems]) // eslint-disable-line react-hooks/exhaustive-deps
  const handleSortChange = (key: SortKey) => setSortBy(key)

  if (items.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#0b1a24] flex items-center justify-center text-stone-400 text-sm">
        Nessun percorso disponibile.
      </div>
    )
  }

  const item = sortedItems[state.index]
  const summary = summaryBanner?.(item)
  const chromeOpacity = 1 - openProgress
  const chromeTransitionMs = dragLive ? 0 : SHEET_TRANSITION_MS

  return (
    // No touch-action restriction at this level: touch-action is capped by the intersection of
    // every ancestor's value, so a blanket restriction here also caps unrelated descendants —
    // it previously broke the bottom gallery's native horizontal scroll, since that strip lives
    // inside this same wrapper. Each element that actually needs to own a gesture sets its own
    // touch-action directly (RouteCarousel, RoutePage's header handle).
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none">
      {/* STAGE — the closed-card "magazine cover": a real photo when available (Resoconto), else
          a stylized non-interactive route map (CoverMap) — never a live/interactive map anymore. */}
      <div className="absolute inset-0">
        <RouteCarousel
          items={sortedItems}
          index={state.index}
          dragging={state.dragging}
          dragDeltaPx={state.dragDeltaPx}
          swipeEnabled={!isOpen}
          onDragStart={() => dispatch({ type: 'DRAG_START' })}
          onDragMove={deltaPx => dispatch({ type: 'DRAG_MOVE', deltaPx })}
          onDragEnd={() => dispatch({ type: 'DRAG_END', count: sortedItems.length })}
          onOpenDragMove={handleOpenDragMove}
          onOpenDragEnd={handleOpenDragEnd}
          renderSlide={(slideItem, _i, inWindow) => (
            slideItem.coverPhotoUrl ? (
              <div className="absolute inset-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slideItem.coverPhotoUrl} alt={slideItem.title}
                  className="absolute inset-0 w-full h-full object-cover" draggable={false}
                  loading={inWindow ? 'eager' : 'lazy'}
                  style={{ filter: 'saturate(1.25) contrast(1.08) brightness(0.85)' }}
                />
                <div
                  className="absolute inset-0 pointer-events-none mix-blend-multiply"
                  style={{ background: 'linear-gradient(160deg, rgba(129,54,25,0.35) 0%, rgba(28,71,36,0.3) 55%, rgba(7,24,36,0.45) 100%)' }}
                />
              </div>
            ) : inWindow ? (
              <CoverMap polyline={slideItem.polyline} />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
            )
          )}
        />

        {/* Subtle darkening over the cover — improves contrast for the white text/pill overlays.
            Fades out as Screen 2 opens, cross-dissolving with it. */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity ease-out"
          style={{ background: 'rgba(4,10,16,0.2)', opacity: chromeOpacity, transitionDuration: `${chromeTransitionMs}ms` }}
        />
      </div>

      {/* Screen 1's chrome cross-dissolves with the page instead of hard-cutting, both opening
          (drag up) and closing (drag down/back button) it — stays mounted the whole time, only
          opacity/pointer-events toggle. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10 transition-opacity ease-out" style={{ opacity: chromeOpacity, transitionDuration: `${chromeTransitionMs}ms` }} />

      {/* Swipe hints — only on the side(s) where another route actually exists. */}
      {state.index > 0 && (
        <div className="pointer-events-none absolute left-2 top-[38%] -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/35 flex items-center justify-center transition-opacity ease-out" style={{ opacity: chromeOpacity, transitionDuration: `${chromeTransitionMs}ms` }}>
          <ChevronLeft className="w-4 h-4 text-white/70" />
        </div>
      )}
      {state.index < sortedItems.length - 1 && (
        <div className="pointer-events-none absolute right-2 top-[38%] -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/35 flex items-center justify-center transition-opacity ease-out" style={{ opacity: chromeOpacity, transitionDuration: `${chromeTransitionMs}ms` }}>
          <ChevronRight className="w-4 h-4 text-white/70" />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 transition-opacity ease-out" style={{ opacity: chromeOpacity, pointerEvents: isOpen ? 'none' : 'auto', transitionDuration: `${chromeTransitionMs}ms` }}>
        <TopOverlay
          itemKey={item.id}
          title={item.title} statPills={item.statPills}
          weatherIcon={weatherIcon?.(item)} onOpenWeather={() => openWithAnimation('meteo')}
          scoreBadges={scoreBadges?.(item, () => openWithAnimation(scoreBadgesTargetSection ?? defaultSection))}
          subtitle={subtitle?.(item)}
          variant={topOverlayVariant}
        />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] transition-opacity ease-out"
        style={{ opacity: chromeOpacity, pointerEvents: isOpen ? 'none' : 'auto', transitionDuration: `${chromeTransitionMs}ms` }}
      >
        {summary && (
          <p className="mx-4 font-display text-[15px] font-semibold text-white leading-snug text-left max-w-xl" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
            {summary}
          </p>
        )}
        <BottomGallery
          mode={mode} items={sortedItems} currentId={item.id}
          onSelect={index => dispatch({ type: 'JUMP_TO', index })}
          sortBy={sortBy} onSortChange={handleSortChange}
          importLabel={importLabel} onImport={onImport}
        />
        {/* Trascina la scheda chiusa verso l'alto per aprirla — unico invito visivo rimasto
            dopo la rimozione dell'icona dedicata. */}
        <div className="flex justify-center">
          <ChevronUp className="w-5 h-5 text-white/60 animate-bounce pointer-events-none" strokeWidth={2.5} />
        </div>
      </div>

      {pageMounted && (
        <div
          className="absolute inset-0 z-40"
          style={{
            opacity: openProgress,
            transform: `translateY(${(1 - openProgress) * OPEN_TRANSLATE_PX}px)`,
            transition: dragLive ? 'none' : `opacity ${SHEET_TRANSITION_MS}ms ease-out, transform ${SHEET_TRANSITION_MS}ms ease-out`,
            pointerEvents: isOpen ? 'auto' : 'none',
          }}
        >
          <RoutePage
            item={item}
            onRequestClose={handleRequestClose}
            onCloseDragMove={handleCloseDragMove}
            onCloseDragEnd={handleCloseDragEnd}
            bodyMode={bodyMode}
            tabs={tabs}
            activeTab={lastSection.current}
            onTabChange={section => dispatch({ type: 'SELECT_TAB', section })}
            renderSection={renderSection}
            tabScrollRef={tabScrollRef}
            primaryAction={primaryAction(item)}
            headerActions={headerActions}
            heroPhotos={heroPhotos}
          />
        </div>
      )}
    </div>
  )
}
