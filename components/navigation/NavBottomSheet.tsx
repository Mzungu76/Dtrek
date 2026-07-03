'use client'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronUp, Pause, Play, MapPin, BookOpen, Camera, NotebookPen, Leaf, Square } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import type { PaceStatus } from '@/lib/navigation/paceAssistant'

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
  /** Estimated arrival time — PaceAssistant's live Naismith+weather+observed-pace estimate once available, otherwise a flat average-speed fallback. Null until there's enough signal to project from. */
  etaDate: Date | null
  /** 'estimating' until the live pace assistant has enough distance/time signal to compare planned vs. observed pace. */
  paceStatus: PaceStatus
  /** Minutes between etaDate and sunset at the current position — null without a live ETA or sun-times fix. Negative means arriving after sunset. */
  daylightMarginMin: number | null
  timerRunning: boolean
  onTogglePlayPause: () => void
  onStop: () => void
  trackPoints: TrackPoint[]
  currentDistanceM: number
  remainingPois: RemainingPoi[]
  guideExcerpts: string[]
  /** Elevation still to climb to the end of the route, from the current position — null until there's a GPS-matched route profile. */
  elevationRemainingM: number | null
  onOpenFoto: () => void
  onOpenNota: () => void
  onOpenSpecie: () => void
  specieAvailable: boolean
}

const PACE_STATUS_STYLE: Record<PaceStatus, { label: string; className: string }> = {
  estimating: { label: 'In stima',    className: 'bg-stone-100 text-stone-500' },
  ahead:      { label: 'In anticipo', className: 'bg-forest-100 text-forest-700' },
  on_pace:    { label: 'A ritmo',     className: 'bg-sky-100 text-sky-700' },
  behind:     { label: 'In ritardo',  className: 'bg-amber-100 text-amber-700' },
}

const COLLAPSED_PX = 172

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
  paceStatus, daylightMarginMin,
  timerRunning, onTogglePlayPause, onStop, trackPoints, currentDistanceM, remainingPois, guideExcerpts,
  elevationRemainingM, onOpenFoto, onOpenNota, onOpenSpecie, specieAvailable,
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
      {/* Livello 2: essenziali sempre visibili — 3 numeri chiave + le 4 azioni della
          navigazione. Tutto il resto (tempi dettagliati, altimetria, percorso/POI/guida)
          resta dietro il trascina-per-espandere qui sotto. Piano di restyling 2.8/4. */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={() => { if (dragHeight === null) toggleSheet() }}
        className="w-full flex flex-col items-center gap-3 pt-2 pb-3 touch-none cursor-grab active:cursor-grabbing select-none"
      >
        <span className="w-9 h-1 rounded-full bg-stone-300" />

        <div className="w-full grid grid-cols-3 gap-2 px-5">
          <div className="text-center">
            <p className="text-[19px] font-bold text-stone-900 font-mono leading-none">{formatKm(distanceRemainingM)} km</p>
            <p className="text-[11px] text-stone-400 mt-1">rimanenti</p>
          </div>
          <div className="text-center">
            <p className="text-[19px] font-bold text-stone-900 font-mono leading-none">{etaDate ? formatEta(etaDate) : '—'}</p>
            <p className="text-[11px] text-stone-400 mt-1">arrivo stimato</p>
          </div>
          <div className="text-center">
            <p className="text-[19px] font-bold text-stone-900 font-mono leading-none">{elevationRemainingM != null ? `${Math.round(elevationRemainingM)} m` : '—'}</p>
            <p className="text-[11px] text-stone-400 mt-1">D+ residuo</p>
          </div>
        </div>

        <div className="w-full flex gap-2 px-4" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={onOpenFoto} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-stone-100 text-stone-600 text-[10px] font-semibold">
            <Camera className="w-[18px] h-[18px]" /> Foto
          </button>
          <button onClick={onOpenNota} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-stone-100 text-stone-600 text-[10px] font-semibold">
            <NotebookPen className="w-[18px] h-[18px]" /> Nota
          </button>
          <button
            onClick={onOpenSpecie}
            disabled={!specieAvailable}
            title={specieAvailable ? undefined : 'Richiede una connessione internet'}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl text-[10px] font-semibold ${
              specieAvailable ? 'bg-stone-100 text-stone-600' : 'bg-stone-50 text-stone-300 cursor-not-allowed'
            }`}
          >
            <Leaf className="w-[18px] h-[18px]" /> Specie
          </button>
          <button onClick={onStop} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-terra-500 text-white text-[10px] font-bold">
            <Square className="w-[18px] h-[18px]" /> Termina
          </button>
        </div>

        <ChevronUp className={`w-3.5 h-3.5 text-stone-300 transition-transform ${sheetState === 'collapsed' ? '' : 'rotate-180'}`} />
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

          <div className="overflow-y-auto px-4 pb-6" style={{ height: `calc(${currentHeight}px - 210px)` }}>
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
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-terra-600 font-body font-semibold">Arrivo stimato {formatEta(etaDate)}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-body ${PACE_STATUS_STYLE[paceStatus].className}`}>
                          {PACE_STATUS_STYLE[paceStatus].label}
                        </span>
                      </div>
                    )}
                    {daylightMarginMin != null && (
                      <div className={`text-xs font-body mt-0.5 ${daylightMarginMin < 0 ? 'text-red-600 font-semibold' : daylightMarginMin < 60 ? 'text-amber-600' : 'text-stone-400'}`}>
                        {daylightMarginMin < 0
                          ? `Arrivo ${Math.round(-daylightMarginMin)} min dopo il tramonto`
                          : `Tramonto tra ${Math.round(daylightMarginMin)} min dall'arrivo`}
                      </div>
                    )}
                  </div>
                  {!timerRunning && movingTimeMs === 0 ? (
                    <button onClick={onTogglePlayPause} className="flex items-center gap-1.5 px-4 h-10 rounded-full bg-forest-500 text-white text-sm font-semibold font-body shadow">
                      <Play className="w-4 h-4" /> Avvia
                    </button>
                  ) : (
                    <button onClick={onTogglePlayPause} className="w-10 h-10 rounded-full bg-forest-500 text-white flex items-center justify-center shadow" aria-label={timerRunning ? 'Pausa' : 'Riprendi'}>
                      {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  )}
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
