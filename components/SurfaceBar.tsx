'use client'
import { AlertTriangle } from 'lucide-react'
import type { SurfaceSegment } from '@/lib/overpass'

export default function SurfaceBar({ segments }: { segments: SurfaceSegment[] }) {
  if (!segments.length) return null
  const traffic = segments.find(s => s.type === 'trafficata')
  const altro = segments.find(s => s.type === 'altro')
  const shown = segments.filter(s => s.type !== 'altro')
  const altroLast = altro ? [altro] : []

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold text-stone-700 mb-4">Tipologia di terreno</h2>

      {/* Stacked bar */}
      <div className="flex h-6 rounded-full overflow-hidden mb-4 gap-px">
        {[...shown, ...altroLast].map(s => (
          <div
            key={s.type}
            style={{ width: `${s.pct}%`, backgroundColor: s.color, minWidth: s.pct > 2 ? undefined : 2 }}
            title={`${s.label}: ${s.distanceKm.toFixed(1)} km (${s.pct}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {[...shown, ...altroLast].map(s => (
          <div key={s.type} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-stone-600 font-medium">{s.label}</span>
            <span className="text-stone-400">{s.distanceKm.toFixed(1)} km · {s.pct}%</span>
          </div>
        ))}
      </div>

      {/* Traffic warning */}
      {traffic && traffic.pct >= 15 && (
        <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Il {traffic.pct}% del percorso ({traffic.distanceKm.toFixed(1)} km) si svolge su strade trafficate — presta attenzione alla sicurezza.</span>
        </div>
      )}
      {traffic && traffic.pct > 0 && traffic.pct < 15 && (
        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Piccola parte su strada trafficata ({traffic.distanceKm.toFixed(1)} km).</span>
        </div>
      )}
    </div>
  )
}
