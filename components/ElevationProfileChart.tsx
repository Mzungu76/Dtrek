'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'

interface Props {
  trackPoints: TrackPoint[]
  syncId?: string
  onHover?: (index: number | null) => void
  /** Distance in meters along the track — when provided, draws a "sei qui" marker at that point on the profile (used during live navigation). */
  currentDistanceM?: number
  /** Fired alongside onHover with the hovered point's altitude/distance, for callers that need the numeric readout without recomputing cumulative distance themselves (e.g. the route hub's altimetry split view). */
  onActivePoint?: (d: { alt: number; kmNum: number } | null) => void
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function ElevationProfileChart({ trackPoints, syncId, onHover, currentDistanceM, onActivePoint }: Props) {
  // Subsample to 300 points max
  const step = Math.max(1, Math.floor(trackPoints.length / 300))
  const pts  = trackPoints
    .map((p, i) => ({ p, i }))
    .filter((_, i) => i % step === 0)

  // Compute cumulative distance for x-axis
  let cumDist = 0
  const data: { km: string; kmNum: number; alt: number; idx: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const { p } = pts[i - 1], { p: c } = pts[i]
      if (p.lat && p.lon && c.lat && c.lon)
        cumDist += haversineM(p.lat, p.lon, c.lat, c.lon)
    }
    if (pts[i].p.altitudeMeters !== undefined)
      data.push({ km: (cumDist / 1000).toFixed(1), kmNum: cumDist / 1000, alt: Math.round(pts[i].p.altitudeMeters!), idx: pts[i].i })
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-stone-50 rounded-xl border border-stone-200 text-stone-400 text-sm">
        Nessun dato altimetrico disponibile
      </div>
    )
  }

  // Find the profile sample closest to the live position, for the "sei qui" marker.
  const currentPoint = currentDistanceM != null
    ? data.reduce((best, d) => Math.abs(d.kmNum - currentDistanceM / 1000) < Math.abs(best.kmNum - currentDistanceM / 1000) ? d : best, data[0])
    : null

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} syncId={syncId}
          onMouseMove={(e: any) => {
            const point = e?.activePayload?.[0]?.payload
            if (point?.idx != null) onHover?.(point.idx)
            if (point) onActivePoint?.({ alt: point.alt, kmNum: point.kmNum })
          }}
          onMouseLeave={() => { onHover?.(null); onActivePoint?.(null) }}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#378d44" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#378d44" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
          <XAxis dataKey="km" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} unit=" km" />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
            tickLine={false} axisLine={false}
            unit=" m" width={55}
          />
          <Tooltip
            formatter={(v: number) => [`${v} m`, 'Quota']}
            labelFormatter={l => `${l} km`}
            labelStyle={{ fontFamily: 'DM Sans', fontSize: 12 }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
          />
          <Area
            type="monotone" dataKey="alt"
            stroke="#277134" strokeWidth={2} strokeLinecap="round"
            fill="url(#elevGrad)" dot={false} activeDot={{ r: 4, fill: '#277134' }}
          />
          {currentPoint && (
            <ReferenceDot
              x={currentPoint.km} y={currentPoint.alt}
              r={6} fill="#d97220" stroke="#fff" strokeWidth={2}
              isFront
              label={{ value: 'Sei qui', position: 'top', fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600, fill: '#c05a17' }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
