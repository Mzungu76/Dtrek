import type { TrackPoint } from '@/lib/tcxParser'

export interface RouteTimelinePhoto {
  id: string
  dataUrl: string
  progress: number
  caption: string
  hasExifGps: boolean
  lat?: number
  lon?: number
}

/**
 * Elevation profile + photo markers along the route.
 * `highlightProgress` (0–1) draws an extra marker at the given point — used by
 * the questionnaire wizard to show which part of the route the current question refers to.
 */
export default function RouteTimeline({
  trackPoints,
  photos,
  highlightProgress,
}: {
  trackPoints: TrackPoint[]
  photos: RouteTimelinePhoto[]
  highlightProgress?: number
}) {
  const pts = trackPoints.filter(p => p.altitudeMeters !== undefined && p.lat && p.lon)
  if (pts.length < 4) return null

  const W = 1000, H = 100
  const alts    = pts.map(p => p.altitudeMeters!)
  const minAlt  = Math.min(...alts)
  const maxAlt  = Math.max(...alts)
  const range   = maxAlt - minAlt || 1

  const toY = (alt: number) => H - 4 - ((alt - minAlt) / range) * (H - 12)

  const pathD = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = toY(p.altitudeMeters!)
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  const sorted = [...photos].sort((a, b) => a.progress - b.progress)

  const highlight = highlightProgress !== undefined
    ? (() => {
        const x   = highlightProgress * W
        const idx = Math.round(highlightProgress * (pts.length - 1))
        const pt  = pts[Math.min(Math.max(idx, 0), pts.length - 1)]
        return { x, y: toY(pt.altitudeMeters!) }
      })()
    : null

  return (
    <div className="relative">
      {/* SVG elevation profile */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        className="w-full" style={{ height: 72 }}>
        {/* Area fill */}
        <defs>
          <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#40916c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#40916c" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path
          d={`${pathD} L ${W} ${H} L 0 ${H} Z`}
          fill="url(#altGrad)" />
        <path d={pathD} fill="none" stroke="#2d6a4f" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Photo markers on profile */}
        {sorted.map(ph => {
          const x  = ph.progress * W
          const idx = Math.round(ph.progress * (pts.length - 1))
          const pt  = pts[Math.min(idx, pts.length - 1)]
          const y   = toY(pt.altitudeMeters!)
          return (
            <g key={ph.id}>
              <line x1={x} y1={y - 2} x2={x} y2={H}
                stroke="#b5a48a" strokeWidth="1" strokeDasharray="3 2" />
              <circle cx={x} cy={y - 2} r={5}
                fill="white" stroke="#2d6a4f" strokeWidth="2" />
            </g>
          )
        })}

        {/* Highlighted question anchor (wizard) */}
        {highlight && (
          <g>
            <line x1={highlight.x} y1={0} x2={highlight.x} y2={H}
              stroke="#d97706" strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx={highlight.x} cy={highlight.y - 2} r={7}
              fill="#fef3c7" stroke="#d97706" strokeWidth="2.5" />
          </g>
        )}
      </svg>

      {/* Photo thumbnails below profile — numbered */}
      {sorted.length > 0 && (
        <div className="relative mt-1" style={{ height: 88 }}>
          {sorted.map((ph, i) => (
            <div key={ph.id}
              className="absolute -translate-x-1/2 top-0 flex flex-col items-center"
              style={{ left: `${ph.progress * 100}%` }}>
              <div className="relative">
                <img src={ph.dataUrl} alt={ph.caption}
                  className="w-14 h-14 object-cover rounded-lg shadow border-2 border-white" />
                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-amber-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center font-barlow">
                  {i + 1}
                </span>
              </div>
              <p className="text-[8px] text-stone-500 font-lora mt-0.5 max-w-[60px] text-center leading-tight">
                {ph.caption}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Min/max altitude labels */}
      <div className="flex justify-between mt-1 px-0.5">
        <span className="text-[9px] text-stone-400 font-mono">↑ {Math.round(minAlt)} m</span>
        <span className="text-[9px] text-stone-400 font-mono">{Math.round(maxAlt)} m ↑</span>
      </div>
    </div>
  )
}
