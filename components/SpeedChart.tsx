'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'
import { msToKmh } from '@/lib/tcxParser'
import { format } from 'date-fns'

interface Props { trackPoints: TrackPoint[]; avgSpeedMs: number }

export default function SpeedChart({ trackPoints, avgSpeedMs }: Props) {
  const step = Math.max(1, Math.floor(trackPoints.length / 300))
  const data = trackPoints
    .filter((_, i) => i % step === 0)
    .filter(p => p.speedMs !== undefined && p.speedMs > 0)
    .map(p => ({
      time: format(new Date(p.time), 'HH:mm'),
      spd: msToKmh(p.speedMs!),
    }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-stone-50 rounded-xl border border-stone-200 text-stone-400 text-sm">
        Nessun dato di velocità disponibile
      </div>
    )
  }

  const avgKmh = msToKmh(avgSpeedMs)

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} />
          <YAxis
            domain={[0, 'auto']}
            tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
            tickLine={false}
            axisLine={false}
            unit=" km/h"
            width={65}
          />
          <Tooltip
            formatter={(v: number) => [`${v} km/h`, 'Velocità']}
            labelStyle={{ fontFamily: 'DM Sans', fontSize: 12 }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
          />
          <ReferenceLine y={avgKmh} stroke="#e08d3c" strokeDasharray="4 4" strokeOpacity={0.7}
            label={{ value: `Media ${avgKmh}`, position: 'right', fontSize: 11, fill: '#e08d3c' }} />
          <Line
            type="monotone"
            dataKey="spd"
            stroke="#e08d3c"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
