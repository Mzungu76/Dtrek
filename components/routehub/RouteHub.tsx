'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouteHubState } from './useRouteHubState'
import RouteCarousel from './RouteCarousel'
import RouteSheet from './RouteSheet'
import TopOverlay from './TopOverlay'
import SideRails from './SideRails'
import BottomGallery from './BottomGallery'
import type { RouteHubProps } from './types'

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
    // touch-action is capped by the intersection of every ancestor's value, so restricting it
    // here to pan-y would also cap the map's own 2D touch panning once the sheet is open (this
    // element wraps it) — only restrict while Screen 1's carousel needs it to leave vertical
    // browser gestures alone; let the map fully own touch once a route is open.
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none" style={{ touchAction: state.openSection ? 'auto' : 'pan-y' }}>
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
          style={{ background: 'rgba(4,10,16,0.35)', opacity: state.openSection ? 0 : 1 }}
        />
      </div>

      {!state.openSection && (
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />
      )}

      {/* Swipe hints — only on the side(s) where another route actually exists. Sit above the
          "apri percorso" button's own vertical center (right-3/5, top-1/2 in SideRails) so the
          two never overlap. */}
      {!state.openSection && state.index > 0 && (
        <div className="pointer-events-none absolute left-2 top-[38%] -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/35 flex items-center justify-center">
          <ChevronLeft className="w-4 h-4 text-white/70" />
        </div>
      )}
      {!state.openSection && state.index < items.length - 1 && (
        <div className="pointer-events-none absolute right-2 top-[38%] -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/35 flex items-center justify-center">
          <ChevronRight className="w-4 h-4 text-white/70" />
        </div>
      )}

      {!state.openSection && (
        <TopOverlay
          itemKey={item.id}
          title={item.title} statPills={item.statPills}
          weatherIcon={weatherIcon?.(item)} onOpenWeather={() => dispatch({ type: 'OPEN_SECTION', section: 'meteo', snap: 'half' })}
          scoreBadges={scoreBadges?.(item, () => dispatch({ type: 'OPEN_SECTION', section: 'dati', snap: 'half' }))}
        />
      )}

      {!state.openSection && (
        <SideRails onOpenSheet={() => dispatch({ type: 'OPEN_SECTION', section: tabs[0]?.key ?? 'dati', snap: 'half' })} />
      )}

      {!state.openSection && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
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
        </div>
      )}

      {state.openSection && (
        // pointer-events-none: this wrapper spans the full screen (inset-0) purely to give
        // RouteSheet a z-40 stacking context — without this, it would sit on top of the map
        // exactly like RouteSheet's own root and block every pan/click above the visible sheet.
        // RouteSheet re-enables pointer-events on its own actual visible chrome.
        <div className="absolute inset-0 z-40 pointer-events-none">
          <RouteSheet
            item={item}
            snap={state.snap}
            onSnapChange={snap => dispatch({ type: 'SET_SNAP', snap })}
            onBackToGallery={() => dispatch({ type: 'CLOSE_SECTION' })}
            tabs={tabs}
            activeTab={state.openSection}
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
