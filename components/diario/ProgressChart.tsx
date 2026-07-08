'use client'
import { useId } from 'react'
import type { AccentTheme } from './types'

/**
 * Distance-aligned SVG chart (progress 0–1 on x-axis) so photo markers — placed by
 * RoutePhoto.progress — line up exactly with the metric series, unlike a time-based axis.
 */
export function ProgressChart({ series, photoMarkers, accent, unit, decimals = 0 }: {
  series: { progress: number; value: number }[]
  photoMarkers?: { progress: number; url: string }[]
  accent: AccentTheme
  unit: string
  decimals?: number
}) {
  // clipPath ids must be unique across the whole document — many ProgressChart instances
  // (one per report, possibly several per report) render simultaneously in the Diario book,
  // and duplicate ids made the browser pick the wrong clipPath for later charts.
  const uid = useId()
  if (series.length < 2) return null
  const values = series.map(s => s.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 660, H = 110, pad = 4
  const topPad = photoMarkers?.length ? 30 : 0
  const chartH = H - topPad
  const pts = series.map(({ progress, value }) => {
    const x = pad + progress * (W - pad * 2)
    const y = topPad + chartH - pad - ((value - min) / range) * (chartH - pad * 2)
    return [x, y]
  })
  const linePath = `M ${pts.map(p => p.join(',')).join(' L ')}`
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]},${topPad + chartH} L ${pts[0][0]},${topPad + chartH} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      <defs>
        {photoMarkers?.map((m, i) => (
          <clipPath key={i} id={`photo-clip-${uid}-${i}`}>
            <circle cx={pad + Math.min(Math.max(m.progress, 0), 1) * (W - pad * 2)} cy={14} r={13} />
          </clipPath>
        ))}
      </defs>
      <path d={areaPath} fill={accent.iconColor} opacity={0.12} />
      <path d={linePath} fill="none" stroke={accent.iconColor} strokeWidth={1.6} />
      {photoMarkers?.map((m, i) => {
        const x = pad + Math.min(Math.max(m.progress, 0), 1) * (W - pad * 2)
        return (
          <g key={i}>
            <line x1={x} y1={28} x2={x} y2={topPad + chartH} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2,2" opacity={0.7} />
            <image href={m.url} x={x - 13} y={1} width={26} height={26} clipPath={`url(#photo-clip-${uid}-${i})`} preserveAspectRatio="xMidYMid slice" />
            <circle cx={x} cy={14} r={13} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
            <circle cx={x + 9} cy={5} r={5.5} fill="#f59e0b" stroke="white" strokeWidth={1} />
            <text x={x + 9} y={7.3} textAnchor="middle" fontSize={6} fill="white" fontFamily="Arial" fontWeight="bold">{i + 1}</text>
          </g>
        )
      })}
      <text x={pad} y={H - 2} fontSize={8} fill="#9ca3af" fontFamily="Arial">{min.toFixed(decimals)}{unit}</text>
      <text x={W - pad} y={topPad + 6} textAnchor="end" fontSize={8} fill="#9ca3af" fontFamily="Arial">{max.toFixed(decimals)}{unit}</text>
    </svg>
  )
}
