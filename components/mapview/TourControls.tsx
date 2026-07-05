'use client'
import { Play, Pause, RotateCcw } from 'lucide-react'

interface Speed { label: string; v: number }

interface Props {
  isPlaying: boolean
  progress: number
  speedIdx: number
  speeds: Speed[]
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onSpeedChange: (i: number) => void
}

/** Play/pause/speed pill for the 2D map tour playback — glass style matching the side rails. */
export default function TourControls({ isPlaying, progress, speedIdx, speeds, onPlay, onPause, onReset, onSpeedChange }: Props) {
  return (
    <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 z-[500] pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-1 bg-black/45 backdrop-blur-md border border-white/15 rounded-full pl-1.5 pr-2.5 py-1.5 shadow-lg">
        <button
          onClick={isPlaying ? onPause : onPlay}
          title={isPlaying ? 'Pausa' : 'Avvia tour'}
          className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white shrink-0"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" fill="currentColor" /> : <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
        </button>
        {progress > 0 && (
          <button onClick={onReset} title="Ricomincia" className="w-7 h-7 rounded-full flex items-center justify-center text-white/70 shrink-0">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex items-center gap-0.5 ml-1">
          {speeds.map((s, i) => (
            <button
              key={s.label}
              onClick={() => onSpeedChange(i)}
              className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors ${i === speedIdx ? 'bg-white text-stone-900' : 'text-white/70'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="w-40 h-1 rounded-full bg-white/20 overflow-hidden">
        <div className="h-full bg-amber-400 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}
