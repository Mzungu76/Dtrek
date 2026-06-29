'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'
import { format } from 'date-fns'

interface Props {
  trackPoints: TrackPoint[]
  syncId?: string
  onHover?: (index: number | null) => void
}

export default function AltimetryChart({ trackPoints, syncId, onHover }: Props) {
  const step = Math.max(1, Math.floor(trackPoints.length / 300))
  const data = trackPoints
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % step === 0)
    .filter(({ p }) => p.altitudeMeters !== undefined)
    .map(({ p, i }) => ({
      time: format(new Date(p.time), 'HH:mm'),
      alt: Math.round(p.altitudeMeters!),
      idx: i,
    }))

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
            <linearGradient id="altGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#378d44" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#378d44" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
            tickLine={false}
            axisLine={false}
            unit=" m"
            width={55}
          />
          <Tooltip
            formatter={(v: number) => [`${v} m`, 'Quota']}
            labelStyle={{ fontFamily: 'DM Sans', fontSize: 12 }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
          />
          <Area
            type="monotone"
            dataKey="alt"
            stroke="#378d44"
            strokeWidth={2}
            fill="url(#altGrad)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
