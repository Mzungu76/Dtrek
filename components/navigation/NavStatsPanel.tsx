'use client'
import { ChevronDown, ChevronUp, Pause, Play, Square } from 'lucide-react'

interface Props {
  distanceCoveredM: number
  distanceRemainingM: number
  currentSpeedMs: number | null
  avgSpeedMs: number | null
  movingTimeMs: number
  timerRunning: boolean
  onTogglePlayPause: () => void
  onStop: () => void
  expanded: boolean
  onToggleExpanded: () => void
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

/**
 * Bottom stats card, Komoot-style. Collapsible so the hiker can free up map
 * space: collapsed shows just a slim summary bar, expanded shows the full
 * distance/speed grid plus timer controls (play/pause the "moving time"
 * clock without ending the session, stop ends navigation).
 */
export default function NavStatsPanel({
  distanceCoveredM, distanceRemainingM, currentSpeedMs, avgSpeedMs, movingTimeMs,
  timerRunning, onTogglePlayPause, onStop, expanded, onToggleExpanded,
}: Props) {
  if (!expanded) {
    return (
      <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl shadow-2xl">
        <button onClick={onToggleExpanded} className="w-full flex flex-col items-center pt-2 pb-1" aria-label="Espandi statistiche">
          <div className="w-10 h-1 rounded-full bg-slate-300 mb-2" />
        </button>
        <div className="flex items-center justify-between px-5 pb-3">
          <div className="text-sm font-semibold text-slate-800">{formatKm(distanceRemainingM)} km rimanenti</div>
          <div className="text-sm font-semibold text-slate-800">{formatDuration(movingTimeMs)}</div>
          <button onClick={onToggleExpanded} className="p-1.5 rounded-lg bg-slate-100" aria-label="Espandi statistiche">
            <ChevronUp className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl shadow-2xl">
      <button onClick={onToggleExpanded} className="w-full flex flex-col items-center pt-2" aria-label="Comprimi statistiche">
        <div className="w-10 h-1 rounded-full bg-slate-300 mb-1" />
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
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
        <div className="flex items-center gap-2">
          {!timerRunning && movingTimeMs === 0 ? (
            <button onClick={onTogglePlayPause} className="flex items-center gap-1.5 px-4 h-10 rounded-full bg-sky-500 text-white text-sm font-semibold shadow" aria-label="Avvia">
              <Play className="w-4 h-4" /> Avvia
            </button>
          ) : (
            <button onClick={onTogglePlayPause} className="w-10 h-10 rounded-full bg-sky-500 text-white flex items-center justify-center shadow" aria-label={timerRunning ? 'Pausa' : 'Riprendi'}>
              {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}
          <button onClick={onStop} className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow" aria-label="Termina">
            <Square className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
