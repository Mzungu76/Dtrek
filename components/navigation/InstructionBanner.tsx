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

const TEXT_SHADOW = '0 1px 3px rgba(0,0,0,0.75), 0 1px 8px rgba(0,0,0,0.5)'
// 44px, non 36px: questi sono tra i pulsanti più toccati durante il cammino (chiudi/audio/bussola)
// — devono restare allo stesso minimo di tocco dei controlli secondari della rotaia (SosButton,
// MapModeSwitcher, ParkingSpotControl), non più piccoli di quelli, per un uso realistico con
// guanti o in movimento.
const ICON_BTN = 'w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm text-white flex items-center justify-center shadow-sm shrink-0'

/**
 * Soluzione B (piano di restyling Navigator): niente più scheda bianca — l'indicazione è testo
 * nudo con ombra sulla mappa, in un'unica riga con chiudi/audio/bussola. La mappa resta piena
 * anche qui, non solo ai lati; "Tra 400 m: ..." compare solo quando la riga viene toccata,
 * dentro una piccola capsula transitoria, non una seconda riga sempre presente.
 */
export default function InstructionBanner({
  current, next, distanceToNextM, speechEnabled, onToggleSpeech,
  onClose, isOnline, compassSupported, compassEnabled, onEnableCompass,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const showRightButton = !isOnline || (compassSupported && !compassEnabled)

  return (
    // Non si posiziona da sé: il chiamante (ActiveNavigationView.tsx) lo mette in cima a un'unica
    // colonna insieme alle epoche/agli avvisi, così l'altezza reale di questa riga — che varia
    // quando si espande "tra X m: ..." — sposta davvero quello che viene sotto, invece di un
    // offset fisso scollegato da cosa c'è sopra.
    <div>
      <div className="flex items-center gap-2">
        <button onClick={onClose} className={ICON_BTN} aria-label="Termina navigazione">
          <X className="w-5 h-5" />
        </button>

        {current && (
          <button
            onClick={() => next && setExpanded((v) => !v)}
            // Sfondo pieno semi-opaco dietro il testo, non solo l'ombra: sotto sole forte o su
            // una mappa molto chiara (neve, satellite, roccia) la sola ombra non basta a
            // garantire il contrasto dell'istruzione più importante della schermata.
            className="flex-1 min-w-0 flex items-center gap-2 text-left bg-black/40 backdrop-blur-sm rounded-2xl pl-1.5 pr-3 py-1.5"
          >
            <span className="shrink-0 w-8 h-8 rounded-full bg-terra-500 text-white flex items-center justify-center shadow-sm">
              {current.turn === 'arrive' ? <Flag className="w-4 h-4" /> : (
                <ArrowUp className="w-4 h-4" style={{ transform: `rotate(${TURN_ROTATION[current.turn]}deg)` }} />
              )}
            </span>
            <span className="min-w-0 truncate text-white font-display font-bold text-[20px] leading-tight" style={{ textShadow: TEXT_SHADOW }}>
              {current.text}
            </span>
            {next && (
              expanded
                ? <ChevronUp className="w-4 h-4 text-white/80 shrink-0" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
                : <ChevronDown className="w-4 h-4 text-white/80 shrink-0" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
            )}
          </button>
        )}

        <button onClick={onToggleSpeech} className={ICON_BTN} aria-label={speechEnabled ? 'Disattiva audio' : 'Attiva audio'}>
          {speechEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {showRightButton && (
          <button
            onClick={isOnline ? onEnableCompass : undefined}
            disabled={!isOnline}
            className={`${ICON_BTN} ${isOnline ? 'text-terra-300' : 'text-white/40 cursor-default'}`}
            aria-label={isOnline ? 'Attiva bussola' : 'Offline'}
            title={isOnline ? 'Attiva bussola' : 'Sei offline: uso i dati scaricati'}
          >
            {isOnline ? <NavigationIcon className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </button>
        )}
      </div>

      {expanded && next && (
        <div className="mt-1.5 ml-14 mr-2 px-3 py-1.5 rounded-xl bg-black/55 backdrop-blur-sm text-white/90 text-sm font-body inline-block">
          Tra {formatDistance(distanceToNextM ?? 0)}: {next.text}
        </div>
      )}
    </div>
  )
}
