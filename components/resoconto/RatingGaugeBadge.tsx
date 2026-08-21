'use client'
import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useCountUp } from '@/components/ScoreRing'

const NEUTRAL_TRACK = 'rgba(255,255,255,0.18)'

export function ratingColor(n: number): string {
  return n >= 9 ? '#16a34a' : n >= 7 ? '#65a30d' : n >= 5 ? '#ea580c' : '#dc2626'
}

function ratingPhrase(n: number): string {
  if (n >= 9) return 'Bellissimo'
  if (n >= 7) return 'Bello'
  if (n >= 5) return 'Nella media'
  return 'Deludente'
}

interface Props {
  value: number
  size?: number
  showLabel?: boolean
  /** Nota scritta dall'utente insieme al voto (opzionale) — mostrata come terza riga troncata
   *  sotto "Voto X/10", così il commento resta visibile ovunque compaia il badge (copertina del
   *  percorso chiuso, sezione Dati e punteggi) invece di andare perso. */
  note?: string
}

/**
 * Badge del voto manuale — stessa impaginazione del badge a doppio anello di Guida
 * (components/TrailScoreGaugeBadge.tsx: anello colorato animato, numero grande al centro,
 * didascalia a fianco), un solo anello invece di due perché qui non c'è un secondo dato
 * (Sicurezza) da mostrare separatamente — solo il voto 0-10 dell'utente.
 *
 * UX-AUDIT.md P-M7 — nel Resoconto questo anello compare subito sopra quello del Comfort
 * TrailScore (TrailScoreGaugeBadge con safety=null, quindi anch'esso un anello singolo): stesso
 * trattamento visivo per un numero scelto dall'utente (opinione) e uno calcolato dall'app
 * (oggettivo), confermato da screenshot come fonte di confusione. La stella nell'angolo (stessa
 * icona del bottone "Vota bellezza" in ResocontoHub.tsx) rende il Voto riconoscibile come "l'ho
 * scelto io" a colpo d'occhio, senza dover leggere la didascalia — nessuna modifica a
 * TrailScoreGaugeBadge, componente condiviso con molte altre schermate.
 */
export function RatingGaugeBadge({ value, size = 80, showLabel = true, note }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const sw = size * 0.15
  const color = ratingColor(value)
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value / 10))
  const len = mounted ? circumference * pct : 0
  const animatedValue = useCountUp(mounted ? value : 0)

  return (
    <div
      className="flex items-center gap-2.5"
      style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.9)', transition: 'opacity 400ms ease, transform 400ms cubic-bezier(.22,.8,.25,1)' }}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={NEUTRAL_TRACK} strokeWidth={sw} />
          <circle
            cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference - len} transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,.8,.25,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display font-black leading-none text-white tabular-nums" style={{ fontSize: size * 0.32, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            {Math.round(animatedValue)}
          </span>
        </div>
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white"
          style={{ width: size * 0.3, height: size * 0.3, backgroundColor: color }}
        >
          <Star className="fill-current" style={{ width: size * 0.17, height: size * 0.17 }} />
        </span>
      </div>
      {showLabel && (
        <div className="flex flex-col">
          <span className="text-white text-[11px] sm:text-xs font-bold uppercase tracking-wide" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
            {ratingPhrase(value)}
          </span>
          <span className="text-white/70 text-[10px] sm:text-[11px]" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
            Voto {value}/10
          </span>
          {note && (
            <span className="text-white/80 text-[10px] sm:text-[11px] italic max-w-[180px] truncate" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
              “{note}”
            </span>
          )}
        </div>
      )}
    </div>
  )
}
