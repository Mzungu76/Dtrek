'use client'
import { tsColor } from '@/components/ScoreRing'
import type { SafetyScore } from '@/lib/safetyScore'

export type SafetyPreview = Pick<SafetyScore, 'overall' | 'color' | 'label'>

export interface TrailScoreGaugeBadgeProps {
  /** Trail Score v2 aggregato, 0-100 — anello interno, spesso, e numero al centro. */
  total: number | null
  /** Sicurezza, 0-100 — anello esterno, sottile, sulla propria scala di colore (non su quella
   *  del TS): due indicatori chiaramente separati invece di un'unica scala che li confonde. Vedi
   *  la formula in lib/trailScoreV2.ts — la Sicurezza è un cancello moltiplicativo sul Valore, non
   *  un componente pesato alla pari con Comfort/Ombra&Acqua, quindi merita un anello a sé. */
  safety: SafetyPreview | null
  loading?: boolean
  vetoed?: boolean
  size?: number
  /** Etichetta della Sicurezza (es. "Sicuro", "Elevato") a fianco del badge — disattivata negli
   *  usi molto compatti (es. la miniatura di galleria) dove non c'è spazio per il testo. */
  showLabel?: boolean
}

const NEUTRAL_TRACK = 'rgba(255,255,255,0.18)'

/**
 * Badge compatto del Trail Score: due anelli concentrici invece di un'unica forma a peso
 * uguale — l'anello esterno sottile è la Sicurezza (il cancello che può azzerare tutto),
 * l'anello interno spesso è il TS finale (già pesato correttamente tra Comfort e Ombra&Acqua).
 * Due indicatori separati, ciascuno sulla propria scala di colore, invece di una geometria che
 * finge una parità che nella formula non esiste. Usato sia nella copertina del percorso aperto
 * (app/guida/GuidaHub.tsx) sia, in versione compatta, nella miniatura di galleria filtrata per TS
 * (components/routehub/BottomGallery.tsx).
 *
 * Puramente presentazionale (nessun proprio `<button>`): entrambi i chiamanti lo mettono già
 * dentro un elemento cliccabile proprio (rispettivamente un `<button>` dedicato e l'intera tile
 * di galleria) — un secondo `<button>` qui dentro anniderebbe due elementi interattivi, HTML non
 * valido oltre che problematico per il click della tile in galleria.
 */
export function TrailScoreGaugeBadge({ total, safety, loading, vetoed, size = 80, showLabel = true }: TrailScoreGaugeBadgeProps) {
  const cx = size / 2
  const cy = size / 2
  const rOuter = size * 0.44
  const swOuter = size * 0.064
  const rInner = size * 0.315
  const swInner = size * 0.14

  if (loading) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="rounded-full bg-white/20" style={{ width: size, height: size }} />
      </div>
    )
  }

  const totalColor = total != null ? tsColor(total) : '#a8a29e'
  const totalPct = total != null ? Math.max(0, Math.min(100, total)) / 100 : 0
  const safetyPct = safety != null ? Math.max(0, Math.min(100, safety.overall)) / 100 : 0

  const cOuter = 2 * Math.PI * rOuter
  const cInner = 2 * Math.PI * rInner
  const outerLen = cOuter * safetyPct
  const innerLen = cInner * totalPct

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={NEUTRAL_TRACK} strokeWidth={swOuter} />
          {safety != null && (
            <circle
              cx={cx} cy={cy} r={rOuter} fill="none" stroke={safety.color} strokeWidth={swOuter} strokeLinecap="round"
              strokeDasharray={`${outerLen} ${cOuter - outerLen}`} transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
          <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={NEUTRAL_TRACK} strokeWidth={swInner} />
          {total != null && (
            <circle
              cx={cx} cy={cy} r={rInner} fill="none" stroke={totalColor} strokeWidth={swInner} strokeLinecap="round"
              strokeDasharray={`${innerLen} ${cInner - innerLen}`} transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display font-black leading-none text-white tabular-nums" style={{ fontSize: size * 0.28, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            {total != null ? Math.round(total) : '—'}
          </span>
        </div>
        {vetoed && (
          <span
            title="Sconsigliato — rischio elevato"
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-600 text-white leading-none"
            style={{ width: size * 0.3, height: size * 0.3, fontSize: size * 0.2 }}
          >
            ⚠
          </span>
        )}
      </div>
      {showLabel && safety != null && (
        <span
          className="text-white text-[11px] sm:text-xs font-bold uppercase tracking-wide"
          style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}
        >
          {safety.label}
        </span>
      )}
    </div>
  )
}
