'use client'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronUp, Pause, Play, Square, MapPin, BookOpen } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import ElevationProfileChart from '@/components/ElevationProfileChart'

type SheetState = 'collapsed' | 'half' | 'full'
type Tab = 'tempi' | 'altimetria' | 'percorso'

interface RemainingPoi {
  id: string | number
  name?: string
  distanceM: number
}

interface Props {
  distanceCoveredM: number
  distanceRemainingM: number
  currentSpeedMs: number | null
  avgSpeedMs: number | null
  movingTimeMs: number
  /** Estimated arrival time, derived from remaining distance / average speed — null until there's a meaningful average speed to project from. */
  etaDate: Date | null
  timerRunning: boolean
  onTogglePlayPause: () => void
  onStop: () => void
  trackPoints: TrackPoint[]
  currentDistanceM: number
  remainingPois: RemainingPoi[]
  guideExcerpts: string[]
}

const COLLAPSED_PX = 64

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function heightForState(state: SheetState): number {
  if (typeof window === 'undefined') return COLLAPSED_PX
  if (state === 'collapsed') return COLLAPSED_PX
  if (state === 'half') return window.innerHeight * 0.45
  return window.innerHeight * 0.85
}

function formatKm(m: number): string {
  return (m / 1000).toFixed(1)
}
function formatKmh(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  return (ms * 3.6).toFixed(1)
}
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
function formatDistM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}
function formatEta(d: Date): string {
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Trail-log style bottom sheet — collapsed by default so the map/route stays
 * the protagonist, drag-to-expand to reveal three tabs (Tempi/Altimetria/
 * Percorso). Reuses the exact drag/snap interaction from ExploreLayout.tsx
 * (pointer-capture drag, 3 discrete snap heights) rather than reinventing it.
 */
export default function NavBottomSheet({
  distanceCoveredM, distanceRemainingM, currentSpeedMs, avgSpeedMs, movingTimeMs, etaDate,
  timerRunning, onTogglePlayPause, onStop, trackPoints, currentDistanceM, remainingPois, guideExcerpts,
}: Props) {
  const [sheetState, setSheetState] = useState<SheetState>('collapsed')
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('tempi')
  const dragStart = useRef<{ y: number; height: number } | null>(null)

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = { y: e.clientY, height: heightForState(sheetState) }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const delta = dragStart.current.y - e.clientY
    setDragHeight(clamp(dragStart.current.height + delta, COLLAPSED_PX, window.innerHeight * 0.9))
  }
  const handlePointerUp = () => {
    if (!dragStart.current) return
    const current = dragHeight ?? heightForState(sheetState)
    const snapPoints: [SheetState, number][] = [
      ['collapsed', heightForState('collapsed')],
      ['half', heightForState('half')],
      ['full', heightForState('full')],
    ]
    const nearest = snapPoints.reduce((a, b) => (Math.abs(b[1] - current) < Math.abs(a[1] - current) ? b : a))
    setSheetState(nearest[0])
    setDragHeight(null)
    dragStart.current = null
  }
  const toggleSheet = () => setSheetState((prev) => (prev === 'collapsed' ? 'half' : 'collapsed'))

  const currentHeight = dragHeight ?? heightForState(sheetState)

  return (
    <div
      className={`absolute bottom-0 inset-x-0 z-10 bg-[#fdfcfa] rounded-t-2xl shadow-2xl border-t border-stone-200 overflow-hidden ${
        dragHeight === null ? 'transition-[height] duration-200 ease-out' : ''
      }`}
      style={{ height: `${currentHeight}px` }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={() => { if (dragHeight === null) toggleSheet() }}
        className="w-full flex flex-col items-center justify-center gap-1 py-2 touch-none cursor-grab active:cursor-grabbing select-none"
      >
        <span className="w-10 h-1 rounded-full bg-stone-300" />
        <span className="flex items-center gap-2 text-xs font-semibold text-stone-600 font-mono">
          {formatKm(distanceRemainingM)} km rimanenti · {formatDuration(movingTimeMs)}
          {etaDate && <> · arrivo {formatEta(etaDate)}</>}
          <ChevronUp className={`w-3.5 h-3.5 transition-transform ${sheetState === 'collapsed' ? '' : 'rotate-180'}`} />
        </span>
      </div>

      {sheetState !== 'collapsed' && (
        <>
          <div className="flex gap-1 px-4 pb-2">
            {([
              ['tempi', 'Tempi'],
              ['altimetria', 'Altimetria'],
              ['percorso', 'Percorso'],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold font-body transition-colors ${
                  tab === id ? 'bg-terra-500 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto px-4 pb-6" style={{ height: `calc(${currentHeight}px - 5.5rem)` }}>
            {tab === 'tempi' && (
              <div>
                <div className="grid grid-cols-2 gap-y-4 py-2">
                  <div>
                    <div className="text-2xl font-bold text-stone-900 font-mono">{formatKm(distanceCoveredM)}<span className="text-sm font-medium text-stone-500 ml-1">km</span></div>
                    <div className="text-xs text-stone-500 font-body">Distanza</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 font-mono">{formatKmh(currentSpeedMs)}<span className="text-sm font-medium text-stone-500 ml-1">km/h</span></div>
                    <div className="text-xs text-stone-500 font-body">Velocità</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 font-mono">{formatKm(distanceRemainingM)}<span className="text-sm font-medium text-stone-500 ml-1">km</span></div>
                    <div className="text-xs text-stone-500 font-body">Rimanenti</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 font-mono">{formatKmh(avgSpeedMs)}<span className="text-sm font-medium text-stone-500 ml-1">km/h</span></div>
                    <div className="text-xs text-stone-500 font-body">Velocità media</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-stone-100">
                  <div>
                    <div className="text-xl font-bold text-stone-900 font-mono">{formatDuration(movingTimeMs)}</div>
                    <div className="text-xs text-stone-500 font-body">Tempo in movimento</div>
                    {etaDate && (
                      <div className="text-xs text-terra-600 font-body font-semibold mt-0.5">Arrivo stimato {formatEta(etaDate)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!timerRunning && movingTimeMs === 0 ? (
                      <button onClick={onTogglePlayPause} className="flex items-center gap-1.5 px-4 h-10 rounded-full bg-forest-500 text-white text-sm font-semibold font-body shadow">
                        <Play className="w-4 h-4" /> Avvia
                      </button>
                    ) : (
                      <button onClick={onTogglePlayPause} className="w-10 h-10 rounded-full bg-forest-500 text-white flex items-center justify-center shadow" aria-label={timerRunning ? 'Pausa' : 'Riprendi'}>
                        {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                    )}
                    <button onClick={onStop} className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center shadow" aria-label="Termina">
                      <Square className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'altimetria' && (
              <ElevationProfileChart trackPoints={trackPoints} currentDistanceM={currentDistanceM} />
            )}

            {tab === 'percorso' && (
              <div className="space-y-4">
                {remainingPois.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-stone-500 font-body mb-2 uppercase tracking-wide">Punti di interesse</div>
                    <ul className="space-y-1.5">
                      {remainingPois.slice(0, 20).map((poi) => (
                        <li key={poi.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-stone-100 text-sm">
                          <span className="flex items-center gap-1.5 text-stone-800 font-body truncate">
                            <MapPin className="w-3.5 h-3.5 text-terra-500 flex-shrink-0" /> {poi.name ?? 'Punto di interesse'}
                          </span>
                          <span className="text-stone-500 font-mono text-xs flex-shrink-0">{formatDistM(poi.distanceM)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {guideExcerpts.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-stone-500 font-body mb-2 uppercase tracking-wide flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" /> Dalla guida
                    </div>
                    <div className="space-y-2">
                      {guideExcerpts.map((text, i) => (
                        <div key={i} className="p-3 rounded-xl bg-terra-50 border-l-4 border-terra-400 text-sm text-stone-700 font-body italic">
                          {text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {remainingPois.length === 0 && guideExcerpts.length === 0 && (
                  <p className="text-sm text-stone-400 font-body py-6 text-center">Nessun punto di interesse o contenuto guida per questo percorso.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
