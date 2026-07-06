'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useRouteHubState } from './useRouteHubState'
import RouteCarousel from './RouteCarousel'
import RouteSheet from './RouteSheet'
import TopOverlay from './TopOverlay'
import BottomGallery from './BottomGallery'
import type { RouteHubProps, SectionKind } from './types'

// Shared duration for the Screen1 ⇄ Screen2 cross-dissolve, both directions.
const SHEET_TRANSITION_MS = 220

export default function RouteHub({
  mode, items, initialIndex, onIndexChange, renderStageMap, tabs, renderSection,
  tabScrollRef, primaryAction, summaryBanner, weatherIcon, onOpenMap3D, onSectionChange,
  scoreBadges, heroPhotos, mapHeaderActions, importLabel, onImport,
}: RouteHubProps) {
  const [state, dispatch] = useRouteHubState(initialIndex)
  // Live height (px) of the Screen 2 sheet — 0 while it's closed — forwarded to the map so it
  // can keep its focus point centered in the visible band as the sheet opens/resizes/drags.
  const [sheetHeightPx, setSheetHeightPx] = useState(0)
  const obscuredBottomPx = state.openSection ? sheetHeightPx : 0
  const isOpen = state.openSection != null

  // Keeps RouteSheet mounted for SHEET_TRANSITION_MS after closing so its opacity can fade to 0
  // instead of vanishing the instant openSection goes null — the mirror image of mounting it
  // immediately and fading opacity 0→1 on open, so the drag-up/drag-down transition dissolves
  // both ways instead of cutting.
  const [sheetMounted, setSheetMounted] = useState(false)
  const [sheetOpacity, setSheetOpacity] = useState(0)
  useEffect(() => {
    if (isOpen) {
      setSheetMounted(true)
      const raf = requestAnimationFrame(() => setSheetOpacity(1))
      return () => cancelAnimationFrame(raf)
    }
    setSheetOpacity(0)
    const t = setTimeout(() => setSheetMounted(false), SHEET_TRANSITION_MS)
    return () => clearTimeout(t)
  }, [isOpen])

  // While closing, openSection is already null but the fading-out sheet still needs a tab to
  // render — keeps showing whatever was last open instead of falling back to nothing.
  const lastSection = useRef<SectionKind>(tabs[0]?.key ?? 'dati')
  if (state.openSection) lastSection.current = state.openSection

  // Notifies the caller of which section is open (or none) so it can derive section-specific map
  // props (highlighted POI/difficulty index, POI layer visibility…) without lifting this reducer out.
  useEffect(() => { onSectionChange?.(state.openSection) }, [state.openSection]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced URL sync — settles ~150ms after the index stops changing so a fast
  // multi-swipe doesn't spam router.replace calls. Skips the very first run: on mount
  // state.index already equals initialIndex (the caller derived it from the same item), so
  // notifying then would just re-run the caller's data fetch for no reason — which briefly
  // produced a new `trackPoints` reference and a visible second map re-fit.
  const indexChangeTimer = useRef<ReturnType<typeof setTimeout>>()
  const skippedFirstRun = useRef(false)
  useEffect(() => {
    if (!onIndexChange || items.length === 0) return
    if (!skippedFirstRun.current) { skippedFirstRun.current = true; return }
    clearTimeout(indexChangeTimer.current)
    indexChangeTimer.current = setTimeout(() => {
      const item = items[state.index]
      if (item) onIndexChange(item, state.index)
    }, 150)
    return () => clearTimeout(indexChangeTimer.current)
  }, [state.index]) // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#0b1a24] flex items-center justify-center text-stone-400 text-sm">
        Nessun percorso disponibile.
      </div>
    )
  }

  const item = items[state.index]
  const summary = summaryBanner?.(item)
  const on3D = onOpenMap3D ? () => { dispatch({ type: 'CLOSE_SECTION' }); onOpenMap3D(item) } : undefined

  return (
    // No touch-action restriction at this level: touch-action is capped by the intersection of
    // every ancestor's value, so a blanket restriction here also caps unrelated descendants —
    // it previously broke the bottom gallery's native horizontal scroll, since that strip lives
    // inside this same wrapper. Each element that actually needs to own a gesture sets its own
    // touch-action directly (RouteCarousel, RouteSheet's drag handle).
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none">
      {/* STAGE — always mounted, never conditioned on openSection, so the map/photo underneath a
          section overlay is the very same instance the user was browsing (zoom/pan preserved) and
          stays identical while switching between sections. */}
      <div className="absolute inset-0">
        {mode === 'resoconto' && (
          <div className="absolute inset-0">{renderStageMap(item, true, obscuredBottomPx)}</div>
        )}

        {(mode === 'guida' || !state.openSection) && (
          <div className="absolute inset-0">
            <RouteCarousel
              items={items}
              index={state.index}
              dragging={state.dragging}
              dragDeltaPx={state.dragDeltaPx}
              swipeEnabled={!state.openSection}
              onDragStart={() => dispatch({ type: 'DRAG_START' })}
              onDragMove={deltaPx => dispatch({ type: 'DRAG_MOVE', deltaPx })}
              onDragEnd={() => dispatch({ type: 'DRAG_END', count: items.length })}
              onOpenSheet={() => dispatch({ type: 'OPEN_SECTION', section: tabs[0]?.key ?? 'dati', snap: 'half' })}
              renderSlide={(slideItem, _i, inWindow) => (
                mode === 'guida' ? (
                  // Interactive once a section is open — the persistent map underneath the glass
                  // sheet must stay pannable/zoomable, even though the carousel itself is still
                  // frozen (no route-swiping while the sheet is up).
                  <div className="absolute inset-0">{renderStageMap(slideItem, state.openSection != null, obscuredBottomPx)}</div>
                ) : slideItem.coverPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slideItem.coverPhotoUrl} alt={slideItem.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} loading={inWindow ? 'eager' : 'lazy'} />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
                )
              )}
            />
          </div>
        )}

        {/* Subtle darkening over Screen 1's frozen carousel — improves contrast for the white
            text/pill overlays. Fades out once the sheet opens: the map is fully interactive
            there and reads as a normal, undimmed map behind the white card. */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{ background: 'rgba(4,10,16,0.2)', opacity: state.openSection ? 0 : 1 }}
        />
      </div>

      {/* Screen 1's chrome cross-dissolves with the sheet instead of hard-cutting, both opening
          (drag up) and closing (drag down/back button) it — stays mounted the whole time, only
          opacity/pointer-events toggle. Each piece keeps its own natural (content-sized)
          footprint rather than one full-screen inset-0 wrapper: a full-screen wrapper with
          pointer-events:auto would swallow every pointer event over the empty middle of the
          screen too, blocking the carousel's own swipe/drag gesture underneath it entirely. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10 transition-opacity ease-out" style={{ opacity: isOpen ? 0 : 1, transitionDuration: `${SHEET_TRANSITION_MS}ms` }} />

      {/* Swipe hints — only on the side(s) where another route actually exists. */}
      {state.index > 0 && (
        <div className="pointer-events-none absolute left-2 top-[38%] -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/35 flex items-center justify-center transition-opacity ease-out" style={{ opacity: isOpen ? 0 : 1, transitionDuration: `${SHEET_TRANSITION_MS}ms` }}>
          <ChevronLeft className="w-4 h-4 text-white/70" />
        </div>
      )}
      {state.index < items.length - 1 && (
        <div className="pointer-events-none absolute right-2 top-[38%] -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/35 flex items-center justify-center transition-opacity ease-out" style={{ opacity: isOpen ? 0 : 1, transitionDuration: `${SHEET_TRANSITION_MS}ms` }}>
          <ChevronRight className="w-4 h-4 text-white/70" />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 transition-opacity ease-out" style={{ opacity: isOpen ? 0 : 1, pointerEvents: isOpen ? 'none' : 'auto', transitionDuration: `${SHEET_TRANSITION_MS}ms` }}>
        <TopOverlay
          itemKey={item.id}
          title={item.title} statPills={item.statPills}
          weatherIcon={weatherIcon?.(item)} onOpenWeather={() => dispatch({ type: 'OPEN_SECTION', section: 'meteo', snap: 'half' })}
          scoreBadges={scoreBadges?.(item, () => dispatch({ type: 'OPEN_SECTION', section: 'dati', snap: 'half' }))}
        />
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] transition-opacity ease-out"
        style={{ opacity: isOpen ? 0 : 1, pointerEvents: isOpen ? 'none' : 'auto', transitionDuration: `${SHEET_TRANSITION_MS}ms` }}
      >
        {summary && (
          <p className="mx-4 font-display text-[15px] font-semibold text-white leading-snug text-left max-w-xl" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
            {summary}
          </p>
        )}
        <BottomGallery
          mode={mode} items={items} currentId={item.id}
          onSelect={index => dispatch({ type: 'JUMP_TO', index })}
          importLabel={importLabel} onImport={onImport}
        />
        {/* Trascina la scheda chiusa verso l'alto per aprirla — unico invito visivo rimasto
            dopo la rimozione dell'icona dedicata. Centrata a parte, senza costringere la
            galleria sopra (che deve restare larga quanto lo schermo per poter scorrere) a
            restringersi al contenuto tramite items-center sul contenitore flex. */}
        <div className="flex justify-center">
          <ChevronUp className="w-5 h-5 text-white/60 animate-bounce pointer-events-none" strokeWidth={2.5} />
        </div>
      </div>

      {sheetMounted && (
        // pointer-events-none: this wrapper spans the full screen (inset-0) purely to give
        // RouteSheet a z-40 stacking context — without this, it would sit on top of the map
        // exactly like RouteSheet's own root and block every pan/click above the visible sheet.
        // RouteSheet re-enables pointer-events on its own actual visible chrome. Opacity fades
        // in step with Screen 1's chrome fading out above, and lingers mounted while closing so
        // it can fade back out instead of disappearing the instant openSection goes null.
        <div
          className="absolute inset-0 z-40 pointer-events-none transition-opacity ease-out"
          style={{ opacity: sheetOpacity, transitionDuration: `${SHEET_TRANSITION_MS}ms` }}
        >
          <RouteSheet
            item={item}
            snap={state.snap}
            onSnapChange={snap => dispatch({ type: 'SET_SNAP', snap })}
            onBackToGallery={() => dispatch({ type: 'CLOSE_SECTION' })}
            onClose={() => dispatch({ type: 'CLOSE_SECTION' })}
            tabs={tabs}
            activeTab={lastSection.current}
            onTabChange={section => dispatch({ type: 'SELECT_TAB', section })}
            renderTabContent={section => renderSection(section, item, () => dispatch({ type: 'CLOSE_SECTION' }))}
            tabScrollRef={tabScrollRef}
            primaryAction={primaryAction(item)}
            on3D={on3D}
            mapHeaderActions={mapHeaderActions}
            heroPhotos={heroPhotos}
            onHeightChange={setSheetHeightPx}
          />
        </div>
      )}
    </div>
  )
}
