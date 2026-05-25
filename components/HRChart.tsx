'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'
import { format } from 'date-fns'

interface Props {
  trackPoints: TrackPoint[]
  avgHR: number
  maxHR: number
}

export default function HRChart({ trackPoints, avgHR, maxHR }: Props) {
  // Campiona 1 punto ogni ~10 secondi per performance
  const step = Math.max(1, Math.floor(trackPoints.length / 300))
  const data = trackPoints
    .filter((_, i) => i % step === 0)
    .filter(p => p.heartRateBpm !== undefined)
    .map(p => ({
      time: format(new Date(p.time), 'HH:mm'),
      hr: p.heartRateBpm,
    }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-stone-50 rounded-xl border border-stone-200 text-stone-400 text-sm">
        Nessun dato FC disponibile
      </div>
    )
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#C0392B" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
            tickLine={false}
            axisLine={false}
            unit=" bpm"
            width={60}
          />
          <Tooltip
            formatter={(v: number) => [`${v} bpm`, 'FC']}
            labelStyle={{ fontFamily: 'DM Sans', fontSize: 12 }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
          />
          <ReferenceLine y={avgHR} stroke="#C0392B" strokeDasharray="4 4" strokeOpacity={0.6}
            label={{ value: `Media ${avgHR}`, position: 'right', fontSize: 11, fill: '#C0392B' }} />
          <Area
            type="monotone"
            dataKey="hr"
            stroke="#C0392B"
            strokeWidth={2}
            fill="url(#hrGrad)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
