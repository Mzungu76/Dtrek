'use client'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { HubMode, RouteHubItem } from './types'

interface Props {
  mode: HubMode
  item: RouteHubItem
  renderStageMap?: (item: RouteHubItem) => React.ReactNode
}

const ZOOM_MIN = 1
const ZOOM_MAX = 4

export default function RouteStage({ mode, item, renderStageMap }: Props) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ x: number; y: number } | null>(null)

  if (mode === 'guida') {
    // Leaflet owns its own pan/zoom gestures + zoom control once `interactive` is true.
    return <div className="absolute inset-0">{renderStageMap?.(item)}</div>
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - dragging.current.x, dy = e.clientY - dragging.current.y
    dragging.current = { x: e.clientX, y: e.clientY }
    setPan(p => ({ x: p.x + dx, y: p.y + dy }))
  }
  const onPointerUp = () => { dragging.current = null }

  return (
    <div className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    >
      {item.coverPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverPhotoUrl}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover select-none"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragging.current ? 'none' : 'transform 0.2s ease' }}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-forest-900 via-forest-800 to-forest-700" />
      )}

      <div className="absolute top-[236px] right-4 z-10 flex flex-col gap-1.5">
        <button
          onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + 0.4))}
          className="w-9 h-9 rounded-xl bg-black/45 backdrop-blur-md border border-white/15 text-white text-lg font-semibold"
        >+</button>
        <button
          onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - 0.4))}
          className="w-9 h-9 rounded-xl bg-black/45 backdrop-blur-md border border-white/15 text-white text-lg font-semibold"
        >−</button>
      </div>
    </div>
  )
}
