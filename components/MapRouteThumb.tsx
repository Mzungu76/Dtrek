'use client'
import { useEffect, useRef, useState } from 'react'
import { boundsFromPolyline, fitTileProjection, projectPoint, tilesForProjection } from '@/lib/webMercator'

interface Props {
  polyline: [number, number][]
  color?: string
  strokeWidth?: number
  /** Same style names app/api/tile/route.ts accepts — defaults to the same 'voyager' basemap the real navigator uses (NavigationMap.tsx), so a list thumbnail looks like a preview of the actual map, not a different one. */
  tileStyle?: string
  className?: string
}

/**
 * Real OSM/CartoDB map tiles behind the route line, for list thumbnails (app/navigatore/page.tsx)
 * — geographically correct alignment via lib/webMercator.ts's Web Mercator math, not a mapping
 * library: mounting a full Leaflet instance per card would mean one live map per row in a
 * potentially long, scrolling list, which is the performance problem this deliberately avoids.
 * Falls back to RouteThumb.tsx's simpler self-fitted line (no map data needed) if the polyline is
 * too short to project.
 */
export default function MapRouteThumb({ polyline, color = '#0284c7', strokeWidth = 3, tileStyle = 'voyager', className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (polyline.length < 2) return null

  const bounds = boundsFromPolyline(polyline)
  const projection = size ? fitTileProjection(bounds, size.width, size.height) : null
  const tiles = projection && size ? tilesForProjection(projection, size.width, size.height) : []
  const linePoints = projection ? polyline.map(([lat, lon]) => projectPoint(lat, lon, projection)) : []

  return (
    <div ref={containerRef} className={`relative w-full h-full overflow-hidden ${className}`}>
      {tiles.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element -- a raster tile mosaic, not a next/image-optimizable asset
        <img
          key={`${t.z}/${t.x}/${t.y}`}
          src={`/api/tile?z=${t.z}&x=${t.x}&y=${t.y}&style=${tileStyle}`}
          alt=""
          width={256}
          height={256}
          className="absolute pointer-events-none select-none"
          style={{ left: t.left, top: t.top }}
          loading="lazy"
        />
      ))}
      {size && (
        <svg viewBox={`0 0 ${size.width} ${size.height}`} className="absolute inset-0 w-full h-full">
          <polyline
            points={linePoints.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  )
}
