'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouteHubState } from './useRouteHubState'
import RouteCarousel from './RouteCarousel'
import RouteSheet from './RouteSheet'
import TopOverlay from './TopOverlay'
import SideRails from './SideRails'
import BottomGallery from './BottomGallery'
import type { RouteHubProps } from './types'

const GALLERY_AUTO_HIDE_MS = 4000

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

  // Screen 1's bottom gallery auto-hides after a short idle period so the map stays the
  // protagonist — any interaction (swipe, JUMP_TO, tapping the persistent handle) re-shows it
  // and restarts the countdown.
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    clearTimeout(hideTimer.current)
    if (state.openSection || !state.galleryVisible) return
    hideTimer.current = setTimeout(() => dispatch({ type: 'HIDE_GALLERY' }), GALLERY_AUTO_HIDE_MS)
    return () => clearTimeout(hideTimer.current)
  }, [state.galleryVisible, state.openSection, state.index, state.dragging]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none" style={{ touchAction: 'pan-y' }}>
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
              onDragStart={() => { dispatch({ type: 'DRAG_START' }); dispatch({ type: 'SHOW_GALLERY' }) }}
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
            text/pill overlays. Fades out as Screen 2's own (darker) scrim fades in. */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{ background: 'rgba(4,10,16,0.35)', opacity: state.openSection ? 0 : 1 }}
        />
        {/* Extra scrim while the sheet is open — a tone darker, so the glass sheet reads as
            floating above the map rather than as a separate page. */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{ background: 'rgba(4,10,16,0.55)', opacity: state.openSection ? 1 : 0 }}
        />
      </div>

      {!state.openSection && (
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />
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
        state.galleryVisible ? (
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
        ) : (
          <button
            onClick={() => dispatch({ type: 'SHOW_GALLERY' })}
            aria-label="Mostra galleria percorsi"
            className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+10px)] left-1/2 -translate-x-1/2 z-20 w-11 h-5 rounded-full bg-white/25 backdrop-blur-md flex items-center justify-center"
          >
            <span className="w-6 h-1 rounded-full bg-white/70" />
          </button>
        )
      )}

      {state.openSection && (
        <div className="absolute inset-0 z-40">
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
