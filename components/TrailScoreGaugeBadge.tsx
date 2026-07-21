'use client'
import { useEffect, useState } from 'react'
import { tsColor, useCountUp } from '@/components/ScoreRing'
import { ctsLabel } from '@/lib/trailScore'
import type { SafetyScore } from '@/lib/safetyScore'

export type SafetyPreview = Pick<SafetyScore, 'overall' | 'color' | 'label'>

export interface TrailScoreGaugeBadgeProps {
  /** Trail Score v2 aggregato, 0-100 — anello interno, spesso, e numero al centro. */
  total: number | null
  /** Comfort TrailScore grezzo, pre-cancello (prima del taglio di Sicurezza), 0-100 — non più usato
   *  dalla didascalia (vedi sotto), mantenuto per compatibilità dei chiamanti esistenti. */
  value?: number | null
  /** Sicurezza, 0-100 — anello esterno, sottile, sulla propria scala di colore (non su quella
   *  del TS): due indicatori chiaramente separati invece di un'unica scala che li confonde. Vedi
   *  la formula in lib/trailScoreV2.ts — la Sicurezza è un cancello moltiplicativo sul Comfort
   *  TrailScore, quindi merita un anello a sé. */
  safety: SafetyPreview | null
  loading?: boolean
  vetoed?: boolean
  size?: number
  /** Didascalia a fianco del badge: due righe etichettate esplicitamente ("Trail Score" ed
   *  "Sicurezza" con la relativa fascia — es. "Molto buono"/"Sicuro") invece di una singola frase
   *  ambigua ("Buon valore, sicuro") che non diceva a cosa si riferisse ciascun numero.
   *  Disattivata negli usi molto compatti (es. la miniatura di galleria) dove non c'è spazio. */
  showLabel?: boolean
  /** Avvisi trovati dalla ricerca web di Giulia (vedi lib/guideNotices.ts) — disegnati come
   *  puntini colorati sull'anello Sicurezza, uno per avviso. Puramente informativo: non cambia il
   *  numero della Sicurezza né del TS, un percorso con un avviso "warning" e Sicurezza 90 mostra
   *  comunque 90 — l'avviso segnala solo "verifica prima di partire", non ricalcola il rischio.
   *  Assente/vuoto ⇒ nessun puntino. */
  notices?: { severity: NoticeDotSeverity }[]
}

export type NoticeDotSeverity = 'danger' | 'warning' | 'info'

const NOTICE_DOT_COLOR: Record<NoticeDotSeverity, string> = {
  danger: '#dc2626',
  warning: '#f59e0b',
  info: '#0ea5e9',
}
// Oltre questo numero i puntini si affollerebbero sull'anello senza restare leggibili — Giulia
// comunque crea avvisi solo per problemi concreti e specifici, non ci si aspetta di arrivarci.
const MAX_NOTICE_DOTS = 5

const NEUTRAL_TRACK = 'rgba(255,255,255,0.18)'

/**
 * Badge compatto del Trail Score: due anelli concentrici — l'anello esterno sottile è la
 * Sicurezza (il cancello che può azzerare tutto), l'anello interno spesso è il TS finale
 * (Comfort TrailScore già passato dal cancello). Due indicatori separati, ciascuno sulla propria
 * scala di colore, invece di una geometria che finge una parità che nella formula non esiste.
 * Usato nella copertina del percorso aperto (app/guida/GuidaHub.tsx), in versione compatta nella
 * miniatura di galleria filtrata per TS (components/routehub/BottomGallery.tsx), e in "Dati e
 * sicurezza" (components/guida/widgets/ScoresWidget.tsx).
 *
 * Si anima al mount (anelli che si riempiono, numero che conta) invece di comparire già pieno —
 * ogni chiamante che lo smonta/rimonta (es. un cambio di tab) fa ripartire l'animazione da zero.
 *
 * Puramente presentazionale (nessun proprio `<button>`): i chiamanti lo mettono già dentro un
 * elemento cliccabile proprio (un `<button>` dedicato, o l'intera tile di galleria) — un secondo
 * `<button>` qui dentro anniderebbe due elementi interattivi, HTML non valido oltre che
 * problematico per il click della tile in galleria.
 */
export function TrailScoreGaugeBadge({ total, safety, loading, vetoed, size = 80, showLabel = true, notices }: TrailScoreGaugeBadgeProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const cx = size / 2
  const cy = size / 2
  const rOuter = size * 0.44
  const swOuter = size * 0.064
  const rInner = size * 0.315
  const swInner = size * 0.14

  const animatedTotal = useCountUp(mounted && total != null ? total : 0)

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
  const outerLen = mounted ? cOuter * safetyPct : 0
  const innerLen = mounted ? cInner * totalPct : 0

  const tsCaption = total != null ? ctsLabel(total).label : null

  // Distribuiti sull'anello Sicurezza, non ammucchiati in un angolo — a partire da alto-destra
  // (non esattamente in cima, dove parte l'arco stesso) e girando in senso orario.
  const noticeDots = (notices ?? []).slice(0, MAX_NOTICE_DOTS)
  const dotR = Math.max(2.5, size * 0.045)

  return (
    <div
      className="flex items-center gap-2.5"
      style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.9)', transition: 'opacity 400ms ease, transform 400ms cubic-bezier(.22,.8,.25,1)' }}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={NEUTRAL_TRACK} strokeWidth={swOuter} />
          {safety != null && (
            <circle
              cx={cx} cy={cy} r={rOuter} fill="none" stroke={safety.color} strokeWidth={swOuter} strokeLinecap="round"
              strokeDasharray={cOuter} strokeDashoffset={cOuter - outerLen} transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,.8,.25,1)' }}
            />
          )}
          <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={NEUTRAL_TRACK} strokeWidth={swInner} />
          {total != null && (
            <circle
              cx={cx} cy={cy} r={rInner} fill="none" stroke={totalColor} strokeWidth={swInner} strokeLinecap="round"
              strokeDasharray={cInner} strokeDashoffset={cInner - innerLen} transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,.8,.25,1) 120ms' }}
            />
          )}
          {noticeDots.map((n, i) => {
            const angle = (-90 + 40 + (360 / Math.max(noticeDots.length, 1)) * i) * (Math.PI / 180)
            const dx = cx + rOuter * Math.cos(angle)
            const dy = cy + rOuter * Math.sin(angle)
            return (
              <circle
                key={i} cx={dx} cy={dy} r={dotR} fill={NOTICE_DOT_COLOR[n.severity]} stroke="#fff" strokeWidth={1.25}
                style={{ opacity: mounted ? 1 : 0, transition: `opacity 300ms ease ${260 + i * 80}ms` }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display font-black leading-none text-white tabular-nums" style={{ fontSize: size * 0.32, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            {total != null ? Math.round(animatedTotal) : '—'}
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
      {showLabel && (tsCaption || safety) && (
        <div className="flex flex-col gap-1">
          {tsCaption && (
            <span className="text-white text-[11px] sm:text-xs font-bold leading-tight" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
              <span className="text-white/55 font-semibold uppercase tracking-wide mr-1.5">Trail Score</span>
              {tsCaption}
            </span>
          )}
          {safety && (
            <span className="text-white text-[11px] sm:text-xs font-bold leading-tight" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
              <span className="text-white/55 font-semibold uppercase tracking-wide mr-1.5">Sicurezza</span>
              {safety.label}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
