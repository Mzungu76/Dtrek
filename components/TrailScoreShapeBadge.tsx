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

function trianglePoints(cx: number, cy: number, r: number, level: number): string {
  return AXES.map(a => `${cx + a.dx * r * level},${cy + a.dy * r * level}`).join(' ')
}

export interface TrailScoreShapeBadgeProps {
  /** I 3 assi 0-100 che compongono il Trail Score v2 — un asse null (es. Ombra&Acqua non ancora
   *  disponibile) disegna quel vertice al centro (non al 100%) invece di indovinare un valore, e
   *  disattiva l'etichetta-forma (serve la forma vera per classificarla onestamente). */
  axes: ShapeAxesNullable | null
  /** Trail Score v2 aggregato, 0-100 — il numero al centro del badge. */
  total: number | null
  loading?: boolean
  vetoed?: boolean
  size?: number
  showLabel?: boolean
  onClick?: () => void
}

/**
 * Badge compatto del Trail Score: un triangolo "perfetto" (i 3 assi al 100%, riferimento) con
 * sovrapposta la forma reale del percorso (i 3 assi ai loro valori) e il numero al centro — a
 * colpo d'occhio si vede sia quanto vale il percorso (numero + colore) sia quanto e dove si
 * discosta dal triangolo ideale (forma), permettendo un confronto diretto tra percorsi diversi.
 * L'etichetta a fianco (SHAPE_LABEL) nomina l'archetipo di quella forma — vedi lib/trailScoreShape.ts.
 */
export function TrailScoreShapeBadge({ axes, total, loading, vetoed, size = 56, showLabel = true, onClick }: TrailScoreShapeBadgeProps) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 9 // margine per stroke + leggibilità del numero

  const archetype = axes && axes.cts != null && axes.safety != null && axes.shade != null
    ? classifyTrailScoreShape({ cts: axes.cts, safety: axes.safety, shade: axes.shade })
    : null
  const color = total != null ? tsColor(total) : '#a8a29e'

  if (loading) {
    return (
      <div className="flex items-center gap-2 animate-pulse">
        <div className="rounded-full bg-white/20" style={{ width: size, height: size }} />
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
      className="pointer-events-auto flex items-center gap-2 group"
      disabled={!onClick}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ overflow: 'visible' }}>
          {/* Triangolo perfetto — riferimento, i 3 assi tutti al 100% */}
          <polygon points={trianglePoints(cx, cy, r, 1)} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.25} strokeLinejoin="round" />
          {/* Forma reale del percorso */}
          <polygon points={dataPoints} fill={`${color}55`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-display font-black leading-none text-white tabular-nums" style={{ fontSize: size * 0.32, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            {total != null ? Math.round(total) : '—'}
          </span>
        </div>
        {vetoed && (
          <span
            title="Sconsigliato — rischio elevato"
            className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-600 text-white leading-none"
            style={{ width: size * 0.36, height: size * 0.36, fontSize: size * 0.24 }}
          >
            ⚠
          </span>
        )}
      </div>
      {showLabel && archetype && (
        <span
          className="text-white text-[11px] sm:text-xs font-bold uppercase tracking-wide group-active:opacity-70"
          style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}
        >
          {SHAPE_LABEL[archetype]}
        </span>
      )}
    </button>
  )
}
