'use client'
import { useEffect, useState } from 'react'
import {
  ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'
import { format } from 'date-fns'
import { Layers } from 'lucide-react'
import { bigNumber, textMuted } from '@/components/routehub/overlayTheme'

interface Props {
  trackPoints: TrackPoint[]
  avgHR: number
  maxHR: number
  syncId?: string
  onHover?: (index: number | null) => void
}

const ALT_LAYER_KEY = 'dtrek_chart_alt_layer'

export default function HRChart({ trackPoints, avgHR, maxHR, syncId, onHover }: Props) {
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

  // Campiona 1 punto ogni ~10 secondi per performance
  const step = Math.max(1, Math.floor(trackPoints.length / 300))
  const data = trackPoints
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % step === 0)
    .filter(({ p }) => p.heartRateBpm !== undefined)
    .map(({ p, i }) => ({
      time: format(new Date(p.time), 'HH:mm'),
      hr: p.heartRateBpm,
      alt: p.altitudeMeters !== undefined ? Math.round(p.altitudeMeters) : undefined,
      idx: i,
    }))

  if (data.length === 0) {
    return (
      <div className={`flex items-center justify-center h-48 text-sm ${textMuted}`}>
        Nessun dato FC disponibile
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-baseline gap-2">
          <span className={`${bigNumber} text-4xl leading-none`} style={{ textShadow: '0 0 20px rgba(255,255,255,0.25)' }}>
            {hovered ?? avgHR}
          </span>
          <span className={`text-sm font-semibold ${textMuted}`}>bpm {hovered ? '' : `· media (max ${maxHR})`}</span>
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
              if (point) setHovered(point.hr)
            }}
            onMouseLeave={() => { onHover?.(null); setHovered(null) }}>
            <defs>
              <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f87171" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="hrAltGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#94a3b8" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.15)' }} />
            <YAxis
              yAxisId="hr"
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.55)' }}
              tickLine={false}
              axisLine={false}
              unit=" bpm"
              width={56}
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
              formatter={(v: number, name: string) => name === 'alt' ? [`${v} m`, 'Quota'] : [`${v} bpm`, 'FC']}
              labelStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}
              itemStyle={{ color: '#fff' }}
              contentStyle={{ background: 'rgba(15,23,32,0.92)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', fontSize: 13 }}
            />
            <ReferenceLine yAxisId="hr" y={avgHR} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: `Media ${avgHR}`, position: 'right', fontSize: 11, fill: '#f87171' }} />
            {showAlt && (
              <Area
                yAxisId="alt"
                type="monotone"
                dataKey="alt"
                stroke="#94a3b8"
                strokeWidth={1}
                fill="url(#hrAltGrad)"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            )}
            <Area
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              stroke="#f87171"
              strokeWidth={2.5}
              style={{ filter: 'drop-shadow(0 0 4px rgba(248,113,113,0.5))' }}
              fill="url(#hrGrad)"
              dot={false}
              activeDot={{ r: 4, fill: '#f87171', stroke: '#fff', strokeWidth: 1.5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
