'use client'
import { tsColor } from '@/components/ScoreRing'
import { classifyTrailScoreShape, SHAPE_LABEL } from '@/lib/trailScoreShape'

export interface ShapeAxesNullable {
  cts: number | null
  safety: number | null
  shade: number | null
}

// Stesso ordine/orientamento degli assi del radar grande (components/ScoreRing.tsx): alto=Comfort,
// basso-destra=Sicurezza, basso-sinistra=Ombra&Acqua — coerenza visiva tra il badge compatto e il
// dettaglio esteso nella tab Punteggi.
const AXES = [
  { dx: 0, dy: -1 },
  { dx: 0.866, dy: 0.5 },
  { dx: -0.866, dy: 0.5 },
] as const
const AXIS_KEYS = ['cts', 'safety', 'shade'] as const

export interface TrailScoreShapeBadgeProps {
  /** I 3 assi 0-100 che compongono il Trail Score v2 — un asse null (es. Ombra&Acqua non ancora
   *  disponibile) disegna quel vertice al centro (non al 100%) invece di indovinare un valore, e
   *  disattiva l'etichetta-forma (serve la forma vera per classificarla onestamente). */
  axes: ShapeAxesNullable | null
  /** Trail Score v2 aggregato, 0-100 — mostrato come numero a fianco del triangolo, non più al
   *  suo interno: la forma resta un indicatore visivo puro, leggibile anche da sola. */
  total: number | null
  loading?: boolean
  vetoed?: boolean
  size?: number
  showLabel?: boolean
  onClick?: () => void
}

/**
 * Badge compatto del Trail Score: solo la forma reale del percorso (i 3 assi ai loro valori),
 * un triangolo pieno colorato secondo la fascia del punteggio — nessun triangolo di riferimento
 * sovrapposto, la forma da sola comunica quanto è "storto" rispetto a un ipotetico ideale
 * equilatero. Numero ed etichetta-archetipo stanno a fianco, non dentro: la forma resta leggibile
 * anche a colpo d'occhio, senza un numero a spezzarla al centro. Vedi lib/trailScoreShape.ts per
 * come viene scelta l'etichetta.
 */
export function TrailScoreShapeBadge({ axes, total, loading, vetoed, size = 72, showLabel = true, onClick }: TrailScoreShapeBadgeProps) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 4 // margine minimo, solo per non tagliare lo stroke sui bordi

  const archetype = axes && axes.cts != null && axes.safety != null && axes.shade != null
    ? classifyTrailScoreShape({ cts: axes.cts, safety: axes.safety, shade: axes.shade })
    : null
  const color = total != null ? tsColor(total) : '#a8a29e'

  if (loading) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="rounded-2xl bg-white/20" style={{ width: size, height: size }} />
      </div>
    )
  }

  const dataPoints = AXES.map((a, i) => {
    const key = AXIS_KEYS[i]
    const v = axes?.[key]
    const pct = v != null ? Math.max(0, Math.min(100, v)) / 100 : 0
    return `${cx + a.dx * r * pct},${cy + a.dy * r * pct}`
  }).join(' ')

  return (
    <button
      onClick={onClick}
      className="pointer-events-auto flex items-center gap-3 group"
      disabled={!onClick}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          {/* Forma reale del percorso — sfondo pieno, nessun triangolo di riferimento */}
          <polygon points={dataPoints} fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} strokeLinejoin="round" />
        </svg>
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
      <span className="flex flex-col items-start">
        <span className="font-display font-black leading-none text-white tabular-nums text-2xl" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
          {total != null ? Math.round(total) : '—'}
        </span>
        {showLabel && archetype && (
          <span
            className="mt-0.5 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-white/90 group-active:opacity-70"
            style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}
          >
            {SHAPE_LABEL[archetype]}
          </span>
        )}
      </span>
    </button>
  )
}
