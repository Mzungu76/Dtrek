'use client'
import { useEffect, useState } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'
import { msToKmh } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { Layers } from 'lucide-react'

interface Props {
  trackPoints: TrackPoint[]
  avgSpeedMs: number
  syncId?: string
  onHover?: (index: number | null) => void
}

const ALT_LAYER_KEY = 'dtrek_chart_alt_layer'

export default function SpeedChart({ trackPoints, avgSpeedMs, syncId, onHover }: Props) {
  const [showAlt, setShowAlt] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(ALT_LAYER_KEY)
    if (saved != null) setShowAlt(saved === '1')
  }, [])

  const toggleAlt = () => {
    setShowAlt(v => {
      localStorage.setItem(ALT_LAYER_KEY, v ? '0' : '1')
      return !v
    })
  }

  const step = Math.max(1, Math.floor(trackPoints.length / 300))
  const data = trackPoints
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % step === 0)
    .filter(({ p }) => p.speedMs !== undefined && p.speedMs > 0)
    .map(({ p, i }) => ({
      time: format(new Date(p.time), 'HH:mm'),
      spd: msToKmh(p.speedMs!),
      alt: p.altitudeMeters !== undefined ? Math.round(p.altitudeMeters) : undefined,
      idx: i,
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
    <div className="relative h-56">
      <button onClick={toggleAlt} title="Mostra/nascondi profilo altimetrico"
        className={`absolute top-0 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors ${
          showAlt ? 'bg-stone-100 text-stone-600' : 'bg-stone-50 text-stone-400'
        }`}>
        <Layers className="w-3 h-3" /> Quota
      </button>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} syncId={syncId}
          onMouseMove={(e: any) => { const idx = e?.activePayload?.[0]?.payload?.idx; if (idx != null) onHover?.(idx) }}
          onMouseLeave={() => onHover?.(null)}>
          <defs>
            <linearGradient id="spdAltGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#9ca3af" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#9ca3af" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fontFamily: 'DM Sans' }} tickLine={false} />
          <YAxis
            yAxisId="spd"
            domain={[0, 'auto']}
            tick={{ fontSize: 11, fontFamily: 'DM Sans' }}
            tickLine={false}
            axisLine={false}
            unit=" km/h"
            width={65}
          />
          {showAlt && (
            <YAxis
              yAxisId="alt"
              orientation="right"
              domain={['auto', 'auto']}
              tick={false}
              tickLine={false}
              axisLine={false}
              width={0}
            />
          )}
          <Tooltip
            formatter={(v: number, name: string) => name === 'alt' ? [`${v} m`, 'Quota'] : [`${v} km/h`, 'Velocità']}
            labelStyle={{ fontFamily: 'DM Sans', fontSize: 12 }}
            contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 13 }}
          />
          <ReferenceLine yAxisId="spd" y={avgKmh} stroke="#e08d3c" strokeDasharray="4 4" strokeOpacity={0.7}
            label={{ value: `Media ${avgKmh}`, position: 'right', fontSize: 11, fill: '#e08d3c' }} />
          {showAlt && (
            <Area
              yAxisId="alt"
              type="monotone"
              dataKey="alt"
              stroke="#9ca3af"
              strokeWidth={1}
              fill="url(#spdAltGrad)"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            yAxisId="spd"
            type="monotone"
            dataKey="spd"
            stroke="#e08d3c"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
