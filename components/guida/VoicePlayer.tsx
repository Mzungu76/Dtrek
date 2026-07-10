'use client'
import { Volume2, Play, Pause, Square } from 'lucide-react'

const RATE_LABELS = ['0.8×', '1×', '1.2×', '1.5×']

interface Props {
  isPlaying: boolean
  isPaused: boolean
  rateIdx: number
  onTogglePlayPause: () => void
  onStop: () => void
  onChangeRate: (idx: number) => void
}

/** Mini-player TTS — pillola inline (non sticky, non fluttuante) che occupa quasi zero spazio
 *  finché non si ascolta la guida, ed espande gli stessi controlli di prima (velocità/play-
 *  pausa/stop) sul posto quando la lettura è attiva. Separato dalla nav sezioni (vedi
 *  GuideSectionNav.tsx) — prima condividevano la stessa barra sticky. Stato/logica TTS restano
 *  in GuideReader.tsx, qui solo la resa. */
export default function VoicePlayer({ isPlaying, isPaused, rateIdx, onTogglePlayPause, onStop, onChangeRate }: Props) {
  const active = isPlaying || isPaused

  if (!active) {
    return (
      <button
        onClick={onTogglePlayPause}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-terra-50 text-terra-700 border border-terra-100 text-[12.5px] font-semibold hover:bg-terra-100 transition-colors"
      >
        <Volume2 className="w-3.5 h-3.5" /> Ascolta la guida
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white border border-stone-200 shadow-sm">
      <div className="flex items-center gap-1">
        {RATE_LABELS.map((label, i) => (
          <button key={label} onClick={() => onChangeRate(i)}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
              rateIdx === i ? 'bg-terra-500 text-white' : 'text-stone-400 hover:text-stone-600'
            }`}
          >{label}</button>
        ))}
      </div>
      <button onClick={onTogglePlayPause}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
          isPlaying ? 'bg-terra-500 text-white hover:bg-terra-600' : 'bg-terra-100 text-terra-700 hover:bg-terra-200'
        }`}
      >
        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
      </button>
      <button onClick={onStop}
        className="w-7 h-7 rounded-full flex items-center justify-center bg-stone-100 text-stone-500 hover:bg-stone-200 transition-colors shrink-0"
      ><Square className="w-2.5 h-2.5" /></button>
    </div>
  )
}
