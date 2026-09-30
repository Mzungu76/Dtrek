'use client'
import { ArrowUp, Flag, Volume2, VolumeX, WifiOff, Navigation as NavigationIcon } from 'lucide-react'
import type { NavInstruction, TurnType } from '@/lib/navigation/types'

interface Props {
  current: NavInstruction | null
  next: NavInstruction | null
  distanceToNextM: number | null
  speechEnabled: boolean
  onToggleSpeech: () => void
  isOnline: boolean
  compassSupported: boolean
  compassEnabled: boolean
  onEnableCompass: () => void
  /** DTREK-AUDIT.md P1 #20 — interruttore manuale (nessun sensore di luce disponibile a una
   *  pagina web): sfondo pieno opaco invece di semi-trasparente sotto sole forte. */
  highContrast?: boolean
}

const TURN_ROTATION: Record<TurnType, number> = {
  start: 0, straight: 0, arrive: 0,
  'slight-right': 30, right: 75, 'sharp-right': 120,
  'slight-left': -30, left: -75, 'sharp-left': -120,
}

/** Distanza spezzata in numero + unità, così il numero può essere grande e l'unità piccola. */
function splitDistance(m: number): { value: string; unit: string } {
  return m >= 1000
    ? { value: (m / 1000).toFixed(1).replace('.', ','), unit: 'km' }
    : { value: String(Math.max(0, Math.round(m / 10) * 10)), unit: 'm' }
}

// 44px: sono tra i pulsanti più toccati durante il cammino (audio/bussola) — stesso minimo di tocco
// degli altri controlli, per un uso realistico con guanti o in movimento.
const ICON_BTN = 'w-11 h-11 rounded-full bg-white/12 text-white flex items-center justify-center shrink-0'

/**
 * Card unica in alto: la PROSSIMA manovra (freccia + distanza a corpo grande + via su due righe),
 * non più il testo dell'istruzione appena passata troncato su una riga. Nessun pulsante di uscita
 * qui: terminare la navigazione sta in Strumenti / Dettagli (con conferma) e nel tasto indietro
 * dell'app Android, così un tocco storto vicino all'istruzione non chiude più tutto.
 */
export default function InstructionBanner({
  current, next, distanceToNextM, speechEnabled, onToggleSpeech,
  isOnline, compassSupported, compassEnabled, onEnableCompass, highContrast,
}: Props) {
  const showRightButton = !isOnline || (compassSupported && !compassEnabled)
  // Con una manovra successiva nota mostriamo quella (con la distanza); altrimenti l'istruzione
  // corrente (es. partenza/arrivo) senza distanza.
  const primary = next ?? current
  const dist = next && distanceToNextM != null ? splitDistance(distanceToNextM) : null
  const bg = highContrast ? 'bg-black' : 'bg-stone-900/95 backdrop-blur-sm'

  return (
    <div className={`flex items-center gap-3 rounded-2xl p-2.5 shadow-xl ${bg}`}>
      {primary ? (
        <>
          <span className="shrink-0 w-[52px] h-[52px] rounded-xl bg-terra-500 text-white flex items-center justify-center">
            {primary.turn === 'arrive' ? <Flag className="w-7 h-7" /> : (
              <ArrowUp className="w-8 h-8" strokeWidth={2.6} style={{ transform: `rotate(${TURN_ROTATION[primary.turn]}deg)` }} />
            )}
          </span>
          <div className="flex-1 min-w-0">
            {dist && (
              <p className="text-white font-mono font-bold leading-none text-[30px]">
                {dist.value}<span className="text-[15px] font-semibold text-white/70 ml-1">{dist.unit}</span>
              </p>
            )}
            <p className="text-white/90 font-body text-[14px] leading-tight mt-0.5 line-clamp-2">{primary.text}</p>
          </div>
        </>
      ) : (
        <p className="flex-1 min-w-0 text-white/80 font-body text-[14px] px-1.5">In attesa della prima indicazione…</p>
      )}

      <div className="flex flex-col gap-1.5 shrink-0">
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
    </div>
  )
}
