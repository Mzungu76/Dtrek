'use client'
import { useEffect, useRef } from 'react'
import Sheet from '@/components/ui/Sheet'
import RouteThumb from '@/components/RouteThumb'
import { useRouteHubState } from './useRouteHubState'
import RouteCarousel from './RouteCarousel'
import RouteStage from './RouteStage'
import TopOverlay from './TopOverlay'
import SideRails from './SideRails'
import BottomGallery from './BottomGallery'
import AltimetrySplit from './AltimetrySplit'
import type { PopupKind, RouteHubProps } from './types'

const POPUP_TITLE: Record<PopupKind, string> = {
  dati: 'Dati & punteggi',
  natura: 'Natura lungo il percorso',
  poi: 'Punti di interesse',
  sicurezza: 'Sicurezza & segnalazioni',
  strumenti: 'Strumenti',
}

export default function RouteHub({
  mode, items, initialIndex, onIndexChange, renderPopup, renderAltimetryMap, renderAltimetryChart,
  renderStageMap, onNavigate, ratingBadge, onOpenRating, onOpenList,
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

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none" style={{ touchAction: 'pan-y' }}>
      {!state.altimetryOpen && (
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
                    <div className="absolute inset-0 bg-gradient-to-br from-[#123448] via-[#0b2333] to-[#071824]">
                      {slideItem.polyline && slideItem.polyline.length > 1 && (
                        <div className="absolute inset-[10%]">
                          <RouteThumb polyline={slideItem.polyline} color="#38bdf8" strokeWidth={2} />
                        </div>
                      )}
                    </div>
                  ) : slideItem.coverPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slideItem.coverPhotoUrl} alt={slideItem.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} loading={inWindow ? 'eager' : 'lazy'} />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
                  )
                )}
              />
            ) : (
              <RouteStage mode={mode} item={item} renderStageMap={renderStageMap} />
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />

          <TopOverlay title={item.title} statPills={item.statPills} onOpenList={onOpenList} />

          <SideRails
            mode={mode}
            locked={state.locked}
            onToggleLock={() => dispatch({ type: 'TOGGLE_LOCK' })}
            onOpenPopup={popup => dispatch({ type: 'OPEN_POPUP', popup })}
            onOpenAltimetria={() => dispatch({ type: 'OPEN_ALTIMETRY' })}
            onNavigate={mode === 'guida' && onNavigate ? () => onNavigate(item) : undefined}
            ratingBadge={mode === 'resoconto' ? ratingBadge?.(item) : undefined}
            onOpenRating={mode === 'resoconto' && onOpenRating ? () => onOpenRating(item) : undefined}
          />

          {state.locked && (
            <BottomGallery mode={mode} items={items} currentId={item.id} onSelect={index => dispatch({ type: 'JUMP_TO', index })} />
          )}
        </>
      )}

      {state.altimetryOpen && (
        <AltimetrySplit
          item={item}
          onClose={() => dispatch({ type: 'CLOSE_ALTIMETRY' })}
          renderMap={renderAltimetryMap}
          renderChart={renderAltimetryChart}
        />
      )}

      <Sheet open={!!state.openPopup} onClose={() => dispatch({ type: 'CLOSE_POPUP' })} title={state.openPopup ? POPUP_TITLE[state.openPopup] : undefined}>
        {state.openPopup && renderPopup(state.openPopup, item)}
      </Sheet>
    </div>
  )
}
