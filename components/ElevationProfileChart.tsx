'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'

interface Props {
  trackPoints: TrackPoint[]
  syncId?: string
  onHover?: (index: number | null) => void
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

export default function ElevationProfileChart({ trackPoints, syncId, onHover }: Props) {
  // Subsample to 300 points max
  const step = Math.max(1, Math.floor(trackPoints.length / 300))
  const pts  = trackPoints
    .map((p, i) => ({ p, i }))
    .filter((_, i) => i % step === 0)

  // Compute cumulative distance for x-axis
  let cumDist = 0
  const data: { km: string; alt: number; idx: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const { p } = pts[i - 1], { p: c } = pts[i]
      if (p.lat && p.lon && c.lat && c.lon)
        cumDist += haversineM(p.lat, p.lon, c.lat, c.lon)
    }
    if (pts[i].p.altitudeMeters !== undefined)
      data.push({ km: (cumDist / 1000).toFixed(1), alt: Math.round(pts[i].p.altitudeMeters!), idx: pts[i].i })
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-stone-50 rounded-xl border border-stone-200 text-stone-400 text-sm">
        Nessun dato altimetrico disponibile
      </div>
    )
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} syncId={syncId}
          onMouseMove={(e: any) => { const idx = e?.activePayload?.[0]?.payload?.idx; if (idx != null) onHover?.(idx) }}
          onMouseLeave={() => onHover?.(null)}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#0284c7" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#0284c7" stopOpacity={0.03} />
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
            stroke="#0284c7" strokeWidth={2}
            fill="url(#elevGrad)" dot={false} activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
