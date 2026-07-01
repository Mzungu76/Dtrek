'use client'
import { useState } from 'react'
import { ArrowUp, ChevronDown, ChevronUp, Flag, Volume2, VolumeX } from 'lucide-react'
import type { NavInstruction, TurnType } from '@/lib/navigation/types'

interface Props {
  current: NavInstruction | null
  next: NavInstruction | null
  distanceToNextM: number | null
  speechEnabled: boolean
  onToggleSpeech: () => void
}

const TURN_ROTATION: Record<TurnType, number> = {
  start: 0, straight: 0, arrive: 0,
  'slight-right': 30, right: 75, 'sharp-right': 120,
  'slight-left': -30, left: -75, 'sharp-left': -120,
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`
}

/**
 * Top instruction banner, Komoot-style: current cue with a rotating arrow,
 * a mute toggle underneath, and a chevron that expands a preview of the
 * next turn so the hiker can plan ahead without waiting for the callout.
 */
export default function InstructionBanner({ current, next, distanceToNextM, speechEnabled, onToggleSpeech }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (!current) return null

  const isArrive = current.turn === 'arrive'

  return (
    <div className="absolute top-3 inset-x-3 z-10">
      <div className="rounded-2xl bg-[#2b2e1a] text-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-shrink-0">
            {isArrive ? <Flag className="w-8 h-8" /> : (
              <ArrowUp className="w-8 h-8" style={{ transform: `rotate(${TURN_ROTATION[current.turn]}deg)` }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold leading-tight truncate">{current.text}</div>
          </div>
          {next && (
            <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-lg bg-white/10 flex-shrink-0" aria-label="Prossima indicazione">
              {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          )}
        </div>
        {expanded && next && (
          <div className="px-4 pb-3 pt-0 text-sm text-white/80 border-t border-white/10">
            Tra {formatDistance(distanceToNextM ?? 0)}: {next.text}
          </div>
        )}
      </div>
      <button
        onClick={onToggleSpeech}
        className="mt-2 w-11 h-11 rounded-full bg-black/70 text-white flex items-center justify-center shadow-lg"
        aria-label={speechEnabled ? 'Disattiva audio' : 'Attiva audio'}
      >
        {speechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
      </button>
    </div>
  )
}
