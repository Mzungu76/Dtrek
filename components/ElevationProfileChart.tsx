'use client'
import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts'
import type { TrackPoint } from '@/lib/tcxParser'
import { bigNumber, textMuted } from '@/components/routehub/overlayTheme'
import { slopeColorSigned } from '@/lib/slopeColor'

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
  const [hovered, setHovered] = useState<{ km: string; kmNum: number; alt: number } | null>(null)

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
      <div className={`flex items-center justify-center h-48 text-sm ${textMuted}`}>
        Nessun dato altimetrico disponibile
      </div>
    )
  }

  // Find the profile sample closest to the live position, for the "sei qui" marker.
  const currentPoint = currentDistanceM != null
    ? data.reduce((best, d) => Math.abs(d.kmNum - currentDistanceM / 1000) < Math.abs(best.kmNum - currentDistanceM / 1000) ? d : best, data[0])
    : null

  const maxAlt = Math.max(...data.map(d => d.alt))
  const displayAlt = hovered?.alt ?? maxAlt

  // Pendenza locale ad ogni punto (media dei due tratti adiacenti) — pilota il colore salita/
  // discesa lungo tutto il profilo, sempre visibile (non solo durante l'interazione, a
  // differenza dell'overlay sulla mappa). L'asse X è a categorie (dataKey stringa), quindi i
  // punti sono spaziati in modo uniforme nel grafico renderizzato: l'offset i/(n-1) del gradiente
  // coincide esattamente con la posizione orizzontale di ciascun punto.
  const slopeAt = (i: number): number => {
    if (data.length < 2) return 0
    const a = data[Math.max(0, i - 1)]
    const b = data[Math.min(data.length - 1, i + 1)]
    const distKm = b.kmNum - a.kmNum
    if (distKm <= 0) return 0
    return ((b.alt - a.alt) / (distKm * 1000)) * 100
  }

  const clearActive = () => { onHover?.(null); onActivePoint?.(null); setHovered(null) }

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`${bigNumber} text-4xl leading-none`}>
          {displayAlt}
        </span>
        <span className={`text-sm font-semibold ${textMuted}`}>m {hovered ? `· ${hovered.km} km` : '· quota max'}</span>
      </div>
      <div
        className="h-52"
        // Recharts non emette un equivalente di onMouseLeave per il touch (sollevare il dito non
        // è geometricamente un "leave") — senza questo, su mobile la pendenza mostrata sulla
        // mappa restava colorata anche dopo aver lasciato il grafico.
        onTouchEnd={clearActive}
        onTouchCancel={clearActive}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} syncId={syncId}
            onMouseMove={(e: any) => {
              const point = e?.activePayload?.[0]?.payload
              if (point?.idx != null) onHover?.(point.idx)
              if (point) { onActivePoint?.({ alt: point.alt, kmNum: point.kmNum }); setHovered(point) }
            }}
            onMouseLeave={clearActive}>
            <defs>
              <linearGradient id="elevSlopeStroke" x1="0" y1="0" x2="1" y2="0">
                {data.map((d, i) => (
                  <stop key={i} offset={`${(i / Math.max(1, data.length - 1)) * 100}%`} stopColor={slopeColorSigned(slopeAt(i))} />
                ))}
              </linearGradient>
              <linearGradient id="elevSlopeFill" x1="0" y1="0" x2="1" y2="0">
                {data.map((d, i) => (
                  <stop key={i} offset={`${(i / Math.max(1, data.length - 1)) * 100}%`} stopColor={slopeColorSigned(slopeAt(i))} stopOpacity={0.3} />
                ))}
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="km" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={{ stroke: '#d6d3d1' }} unit=" km" />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#78716c' }}
              tickLine={false} axisLine={false}
              unit=" m" width={48}
            />
            <Tooltip
              formatter={(v: number) => [`${v} m`, 'Quota']}
              labelFormatter={l => `${l} km`}
              labelStyle={{ fontSize: 12, color: '#57534e' }}
              itemStyle={{ color: '#1c1917' }}
              contentStyle={{ background: '#ffffff', borderRadius: 10, border: '1px solid #e7e5e4', fontSize: 13 }}
            />
            <Area
              type="monotone" dataKey="alt"
              stroke="url(#elevSlopeStroke)" strokeWidth={2.75} strokeLinecap="round"
              fill="url(#elevSlopeFill)" dot={false} activeDot={{ r: 4, fill: '#44403c', stroke: '#fff', strokeWidth: 1.5 }}
            />
            {currentPoint && (
              <ReferenceDot
                x={currentPoint.km} y={currentPoint.alt}
                r={6} fill="#44403c" stroke="#fff" strokeWidth={2}
                isFront
                label={{ value: 'Sei qui', position: 'top', fontSize: 11, fontWeight: 600, fill: '#44403c' }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-2 mt-1.5 px-1">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-sky-600">Discesa</span>
        <div className="flex-1 h-1 rounded-full" style={{ background: 'linear-gradient(90deg,#1d4ed8,#5eead4,#a8a29e,#fbbf24,#b91c1c)' }} />
        <span className="text-[9px] font-semibold uppercase tracking-wide text-red-700">Salita</span>
      </div>
    </div>
  )
}
