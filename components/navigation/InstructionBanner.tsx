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
 * Top instruction card, Dtrek style: a warm paper-like card (not a solid
 * dark navigation-app bar) with a terra waypoint arrow and Playfair Display
 * for the instruction text, closer to a guidebook margin note than a
 * turn-by-turn HUD. Close/compass controls live in the same row as the card
 * (not separately floating at the same offset) so nothing overlaps.
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
        <button onClick={onClose} className="w-12 h-12 rounded-full bg-white text-stone-700 border border-stone-200 flex items-center justify-center shadow-lg flex-shrink-0" aria-label="Termina navigazione">
          <X className="w-5 h-5" />
        </button>

        {current && (
          <div className="flex-1 min-w-0 rounded-2xl bg-[#fdfcfa] border border-stone-200 shadow-lg overflow-hidden">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-terra-500 text-white flex items-center justify-center">
                {current.turn === 'arrive' ? <Flag className="w-5 h-5" /> : (
                  <ArrowUp className="w-5 h-5" style={{ transform: `rotate(${TURN_ROTATION[current.turn]}deg)` }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold font-display leading-tight truncate text-stone-900">{current.text}</div>
              </div>
              {next && (
                <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-lg bg-stone-100 text-stone-500 flex-shrink-0" aria-label="Prossima indicazione">
                  {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              )}
            </div>
            {expanded && next && (
              <div className="px-3.5 pb-2.5 pt-0 text-sm text-stone-600 font-body border-t border-stone-100">
                Tra {formatDistance(distanceToNextM ?? 0)}: {next.text}
              </div>
            )}
          </div>
        )}

        {showRightButton && (
          <button
            onClick={isOnline ? onEnableCompass : undefined}
            disabled={!isOnline}
            // isOnline false means this is purely an offline status indicator,
            // not an actionable button — it used to render with the exact
            // same enabled look as the compass button despite onClick being
            // undefined, a real affordance mismatch (tap does nothing but
            // looks like it should).
            className={`w-12 h-12 rounded-full border flex items-center justify-center shadow-lg flex-shrink-0 ${
              isOnline ? 'bg-white text-terra-600 border-stone-200' : 'bg-stone-100 text-stone-400 border-stone-200 cursor-default'
            }`}
            aria-label={isOnline ? 'Attiva bussola' : 'Offline'}
            title={isOnline ? 'Attiva bussola' : 'Sei offline: uso i dati scaricati'}
          >
            {isOnline ? <NavigationIcon className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </button>
        )}
      </div>

      <button
        onClick={onToggleSpeech}
        className="mt-2 w-10 h-10 rounded-full bg-forest-600 text-white flex items-center justify-center shadow-lg"
        aria-label={speechEnabled ? 'Disattiva audio' : 'Attiva audio'}
      >
        {speechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
      </button>
    </div>
  )
}
