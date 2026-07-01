'use client'

interface Props {
  distanceCoveredM: number
  distanceRemainingM: number
  currentSpeedMs: number | null
  avgSpeedMs: number | null
  movingTimeMs: number
}

function formatKm(m: number): string {
  return (m / 1000).toFixed(1)
}

function formatKmh(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '--'
  return (ms * 3.6).toFixed(1)
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Bottom stats card, Komoot-style: distance covered/remaining, current/average speed, moving time. */
export default function NavStatsPanel({ distanceCoveredM, distanceRemainingM, currentSpeedMs, avgSpeedMs, movingTimeMs }: Props) {
  return (
    <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl shadow-2xl">
      <div className="flex justify-center pt-2">
        <div className="w-10 h-1 rounded-full bg-slate-300" />
      </div>
      <div className="grid grid-cols-2 gap-y-4 px-6 py-4">
        <div>
          <div className="text-2xl font-bold text-slate-900">{formatKm(distanceCoveredM)}<span className="text-sm font-medium text-slate-500 ml-1">km</span></div>
          <div className="text-xs text-slate-500">Distanza</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{formatKmh(currentSpeedMs)}<span className="text-sm font-medium text-slate-500 ml-1">km/h</span></div>
          <div className="text-xs text-slate-500">Velocità</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{formatKm(distanceRemainingM)}<span className="text-sm font-medium text-slate-500 ml-1">km</span></div>
          <div className="text-xs text-slate-500">Rimanenti</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-slate-900">{formatKmh(avgSpeedMs)}<span className="text-sm font-medium text-slate-500 ml-1">km/h</span></div>
          <div className="text-xs text-slate-500">Velocità media</div>
        </div>
      </div>
      <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
        <div>
          <div className="text-xl font-bold text-slate-900">{formatDuration(movingTimeMs)}</div>
          <div className="text-xs text-slate-500">Tempo in movimento</div>
        </div>
      </div>
    </div>
  )
}
