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
  onNavigate, onOpenOffline, ratingBadge, onOpenRating, datiBadge, featuredLabel, featuredIcon, onOpenFeatured,
  summaryBanner, weatherIcon, drivingIcon, onOpenMap3D, renderUnlockedControls,
}: RouteHubProps) {
  const [state, dispatch] = useRouteHubState(initialIndex)

  // Debounced URL sync — settles ~150ms after the index stops changing so a fast
  // multi-swipe doesn't spam router.replace calls.
  const indexChangeTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!onIndexChange || items.length === 0) return
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
      {!state.openSection && (
        <>
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
                    <div className="absolute inset-0">{renderStageMap(slideItem, false)}</div>
                  ) : slideItem.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slideItem.coverPhotoUrl} alt={slideItem.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} loading={inWindow ? 'eager' : 'lazy'} />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
                  )
                )}
              />
            ) : (
              <RouteStage mode={mode} item={item} renderStageMap={i => renderStageMap(i, true)} />
            )}
            {/* "Congelata" tint — only while locked; removed the instant the map unfreezes. */}
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{ background: 'rgba(4,10,16,0.35)', opacity: state.locked ? 1 : 0 }}
            />
          </div>

          {state.locked && (
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />
          )}

          {state.locked && (
            <TopOverlay
              title={item.title} statPills={item.statPills}
              weatherIcon={weatherIcon?.(item)} onOpenWeather={() => dispatch({ type: 'OPEN_SECTION', section: 'meteo' })}
              drivingIcon={drivingIcon?.(item)} onOpenDriving={() => dispatch({ type: 'OPEN_SECTION', section: 'dati' })}
            />
          )}

          <SideRails
            mode={mode}
            locked={state.locked}
            onToggleLock={() => dispatch({ type: 'TOGGLE_LOCK' })}
            onOpenSection={section => dispatch({ type: 'OPEN_SECTION', section })}
            datiBadge={datiBadge?.(item)}
            onNavigate={mode === 'guida' && onNavigate ? () => onNavigate(item) : undefined}
            onOpenOffline={mode === 'guida' && onOpenOffline ? () => onOpenOffline(item) : undefined}
            ratingBadge={mode === 'resoconto' ? ratingBadge?.(item) : undefined}
            onOpenRating={mode === 'resoconto' && onOpenRating ? () => onOpenRating(item) : undefined}
            featuredLabel={featuredLabel}
            featuredIcon={featuredIcon}
            onOpenFeatured={() => onOpenFeatured(item)}
            onOpenMap3D={onOpenMap3D ? () => onOpenMap3D(item) : undefined}
            unlockedControls={renderUnlockedControls?.(item)}
          />

          {state.locked && summary && (
            <div className="absolute inset-x-4 z-20 pointer-events-none" style={{ bottom: 'calc(env(safe-area-inset-bottom,0px) + 96px)' }}>
              <p className="pointer-events-auto font-display text-[15px] font-semibold text-white leading-snug text-left max-w-xl" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                {summary}
              </p>
            </div>
          )}

          {state.locked && (
            <BottomGallery mode={mode} items={items} currentId={item.id} onSelect={index => dispatch({ type: 'JUMP_TO', index })} />
          )}
        </>
      )}

      {state.openSection && renderSection(state.openSection, item, () => dispatch({ type: 'CLOSE_SECTION' }))}
    </div>
  )
}
