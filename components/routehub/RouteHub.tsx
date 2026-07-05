'use client'
import { useEffect, useRef } from 'react'
import { useRouteHubState } from './useRouteHubState'
import RouteCarousel from './RouteCarousel'
import RouteStage from './RouteStage'
import TopOverlay from './TopOverlay'
import SideRails from './SideRails'
import BottomGallery from './BottomGallery'
import type { RouteHubProps } from './types'

export default function RouteHub({
  mode, items, initialIndex, onIndexChange, renderStageMap, renderSection,
  onNavigate, ratingBadge, onOpenRating, datiBadge, featuredLabel, featuredIcon, onOpenFeatured,
  featuredOpensSection, summaryBanner, weatherIcon, onOpenMap3D, renderUnlockedControls, importLabel, onImport,
  onSectionChange, scoreBadges,
}: RouteHubProps) {
  const [state, dispatch] = useRouteHubState(initialIndex)

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
  const summary = state.locked ? summaryBanner?.(item) : null

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none" style={{ touchAction: 'pan-y' }}>
      {/* STAGE — always mounted, never conditioned on openSection, so the map/photo underneath a
          section overlay is the very same instance the user was browsing (zoom/pan preserved) and
          stays identical while switching between sections. */}
      <div className="absolute inset-0">
        {mode === 'resoconto' && (
          <div className="absolute inset-0">{renderStageMap(item, true)}</div>
        )}

        {(mode === 'guida' || !state.openSection) && (
          <div className="absolute inset-0">
            {state.locked ? (
              <RouteCarousel
                items={items}
                index={state.index}
                dragging={state.dragging}
                dragDeltaPx={state.dragDeltaPx}
                onDragStart={() => dispatch({ type: 'DRAG_START' })}
                onDragMove={deltaPx => dispatch({ type: 'DRAG_MOVE', deltaPx })}
                onDragEnd={() => dispatch({ type: 'DRAG_END', count: items.length })}
                renderSlide={(slideItem, _i, inWindow) => (
                  mode === 'guida' ? (
                    // Interactive once a section is open — the persistent map underneath the glass
                    // sheet must stay pannable/zoomable, even though the carousel itself is still
                    // "locked" (no route-swiping while a section overlay is up).
                    <div className="absolute inset-0">{renderStageMap(slideItem, state.openSection != null)}</div>
                  ) : slideItem.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slideItem.coverPhotoUrl} alt={slideItem.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} loading={inWindow ? 'eager' : 'lazy'} />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
                  )
                )}
              />
            ) : mode === 'guida' ? (
              <RouteStage mode={mode} item={item} renderStageMap={i => renderStageMap(i, true)} />
            ) : (
              <RouteStage mode={mode} item={item} />
            )}
          </div>
        )}

        {/* "Congelata" tint — only while locked; removed the instant the map unfreezes. */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{ background: 'rgba(4,10,16,0.35)', opacity: state.locked ? 1 : 0 }}
        />
        {/* Extra scrim while a section overlay is open — a tone darker, so the glass sheet reads as
            floating above the map rather than as a separate page. */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{ background: 'rgba(4,10,16,0.55)', opacity: state.openSection ? 1 : 0 }}
        />
      </div>

      {state.locked && !state.openSection && (
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />
      )}

      {state.locked && !state.openSection && (
        <TopOverlay
          title={item.title} statPills={item.statPills}
          weatherIcon={weatherIcon?.(item)} onOpenWeather={() => dispatch({ type: 'OPEN_SECTION', section: 'meteo' })}
          scoreBadges={scoreBadges?.(item, () => dispatch({ type: 'OPEN_SECTION', section: 'dati' }))}
        />
      )}

      {!state.openSection && (
        <SideRails
          mode={mode}
          locked={state.locked}
          onToggleLock={() => dispatch({ type: 'TOGGLE_LOCK' })}
          onOpenSection={section => dispatch({ type: 'OPEN_SECTION', section })}
          datiBadge={datiBadge?.(item)}
          onNavigate={mode === 'guida' && onNavigate ? () => onNavigate(item) : undefined}
          ratingBadge={mode === 'resoconto' ? ratingBadge?.(item) : undefined}
          onOpenRating={mode === 'resoconto' && onOpenRating ? () => onOpenRating(item) : undefined}
          featuredLabel={featuredLabel}
          featuredIcon={featuredIcon}
          onOpenFeatured={() => featuredOpensSection ? dispatch({ type: 'OPEN_SECTION', section: 'featured' }) : onOpenFeatured(item)}
          onOpenMap3D={onOpenMap3D ? () => onOpenMap3D(item) : undefined}
          unlockedControls={renderUnlockedControls?.(item)}
        />
      )}

      {state.locked && !state.openSection && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]"
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
        </div>
      )}

      {state.openSection && (
        <div className="absolute inset-0 z-40">
          {renderSection(state.openSection, item, () => dispatch({ type: 'CLOSE_SECTION' }))}
        </div>
      )}
    </div>
  )
}
