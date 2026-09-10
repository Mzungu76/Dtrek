'use client'
import { useMemo } from 'react'

interface Props {
  polyline: [number, number][]
  color?: string
  strokeWidth?: number
  className?: string
}

export default function RouteThumb({ polyline, color = '#2d7a3d', strokeWidth = 3, className = '' }: Props) {
  const d = useMemo(() => {
    if (polyline.length < 2) return ''
    const lats = polyline.map(p => p[0])
    const lons = polyline.map(p => p[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLon = Math.min(...lons)
    const maxLon = Math.max(...lons)
    const latRange = maxLat - minLat || 0.0001
    const lonRange = maxLon - minLon || 0.0001
    // preserve aspect ratio, fit in a 100×100 viewBox with 8% padding
    const pad = 8
    const scale = Math.min((100 - 2 * pad) / lonRange, (100 - 2 * pad) / latRange)
    const usedW = lonRange * scale
    const usedH = latRange * scale
    const offX = (100 - usedW) / 2
    const offY = (100 - usedH) / 2
    const pts = polyline.map(([lat, lon]) => {
      const x = offX + (lon - minLon) * scale
      const y = offY + (maxLat - lat) * scale
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    return `M ${pts.join(' L ')}`
  }, [polyline])

  if (!d) return null

  return (
    <svg
      viewBox="0 0 100 100"
      className={`w-full h-full ${className}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
