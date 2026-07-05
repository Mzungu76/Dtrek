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
import { bigNumber, textMuted } from '@/components/routehub/overlayTheme'

interface Props {
  trackPoints: TrackPoint[]
  avgSpeedMs: number
  syncId?: string
  onHover?: (index: number | null) => void
}

const ALT_LAYER_KEY = 'dtrek_chart_alt_layer'

export default function SpeedChart({ trackPoints, avgSpeedMs, syncId, onHover }: Props) {
  const [showAlt, setShowAlt] = useState(true)
  const [hovered, setHovered] = useState<number | null>(null)

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
      <div className={`flex items-center justify-center h-48 text-sm ${textMuted}`}>
        Nessun dato di velocità disponibile
      </div>
    )
  }

  const avgKmh = msToKmh(avgSpeedMs)

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-baseline gap-2">
          <span className={`${bigNumber} text-4xl leading-none`} style={{ textShadow: '0 0 20px rgba(255,255,255,0.25)' }}>
            {hovered ?? avgKmh}
          </span>
          <span className={`text-sm font-semibold ${textMuted}`}>km/h {hovered ? '' : '· media'}</span>
        </div>
        <button onClick={toggleAlt} title="Mostra/nascondi profilo altimetrico"
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors ${
            showAlt ? 'bg-white/15 text-stone-100' : 'bg-white/5 text-stone-400'
          }`}>
          <Layers className="w-3 h-3" /> Quota
        </button>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} syncId={syncId}
            onMouseMove={(e: any) => {
              const point = e?.activePayload?.[0]?.payload
              if (point?.idx != null) onHover?.(point.idx)
              if (point) setHovered(point.spd)
            }}
            onMouseLeave={() => { onHover?.(null); setHovered(null) }}>
            <defs>
              <linearGradient id="spdAltGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} />
            <YAxis
              yAxisId="spd"
              domain={[0, 'auto']}
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
              tickLine={false}
              axisLine={false}
              unit=" km/h"
              width={60}
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
              labelStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}
              itemStyle={{ color: '#fff' }}
              contentStyle={{ background: 'rgba(15,23,32,0.92)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', fontSize: 13 }}
            />
            <ReferenceLine yAxisId="spd" y={avgKmh} stroke="#38bdf8" strokeDasharray="4 4" strokeOpacity={0.8}
              label={{ value: `Media ${avgKmh}`, position: 'right', fontSize: 11, fill: '#38bdf8' }} />
            {showAlt && (
              <Area
                yAxisId="alt"
                type="monotone"
                dataKey="alt"
                stroke="#94a3b8"
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
              stroke="#38bdf8"
              strokeWidth={2.5}
              style={{ filter: 'drop-shadow(0 0 4px rgba(56,189,248,0.5))' }}
              dot={false}
              activeDot={{ r: 4, fill: '#38bdf8', stroke: '#fff', strokeWidth: 1.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
