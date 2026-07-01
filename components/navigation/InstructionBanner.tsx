'use client'
import { useState } from 'react'
import { ArrowUp, ChevronDown, ChevronUp, Flag, Volume2, VolumeX, WifiOff, X, Navigation as NavigationIcon } from 'lucide-react'
import type { NavInstruction, TurnType } from '@/lib/navigation/types'

interface Props {
  current: NavInstruction | null
  next: NavInstruction | null
  distanceToNextM: number | null
  speechEnabled: boolean
  onToggleSpeech: () => void
  onClose: () => void
  isOnline: boolean
  compassSupported: boolean
  compassEnabled: boolean
  onEnableCompass: () => void
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
 * Top instruction banner, Komoot-style: a close button and a
 * connectivity/compass button live INSIDE the same row as the instruction
 * pill (not as separately floating circles) so nothing overlaps regardless
 * of banner width. The right-side button only appears when it does
 * something the hiker can act on (enable compass) or needs to know
 * (offline) — no unlabeled mystery icon.
 */
export default function InstructionBanner({
  current, next, distanceToNextM, speechEnabled, onToggleSpeech,
  onClose, isOnline, compassSupported, compassEnabled, onEnableCompass,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const showRightButton = !isOnline || (compassSupported && !compassEnabled)

  return (
    <div className="absolute top-3 inset-x-3 z-10">
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="w-14 h-14 rounded-full bg-[#2b2e1a] text-white flex items-center justify-center shadow-xl flex-shrink-0" aria-label="Termina navigazione">
          <X className="w-6 h-6" />
        </button>

        {current && (
          <div className="flex-1 min-w-0 rounded-2xl bg-[#2b2e1a] text-white shadow-xl overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex-shrink-0">
                {current.turn === 'arrive' ? <Flag className="w-7 h-7" /> : (
                  <ArrowUp className="w-7 h-7" style={{ transform: `rotate(${TURN_ROTATION[current.turn]}deg)` }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold leading-tight truncate">{current.text}</div>
              </div>
              {next && (
                <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-lg bg-white/10 flex-shrink-0" aria-label="Prossima indicazione">
                  {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              )}
            </div>
            {expanded && next && (
              <div className="px-3 pb-2.5 pt-0 text-sm text-white/80 border-t border-white/10">
                Tra {formatDistance(distanceToNextM ?? 0)}: {next.text}
              </div>
            )}
          </div>
        )}

        {showRightButton && (
          <button
            onClick={isOnline ? onEnableCompass : undefined}
            className="w-14 h-14 rounded-full bg-[#2b2e1a] text-white flex items-center justify-center shadow-xl flex-shrink-0"
            aria-label={isOnline ? 'Attiva bussola' : 'Offline'}
            title={isOnline ? 'Attiva bussola' : 'Sei offline: uso i dati scaricati'}
          >
            {isOnline ? <NavigationIcon className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </button>
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
