'use client'
import { useState, useEffect, useRef } from 'react'
import type { SafetyScore } from '@/lib/safetyScore'
import { ctsLabel, type TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { computeTrailScoreV2, SAFETY_VETO_THRESHOLD } from '@/lib/trailScoreV2'
import { SafetyScoreWidget } from '@/components/SafetyScoreWidget'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import Sheet from '@/components/ui/Sheet'

export interface CtsProps {
  result: TrailScoreResult | null
  cached?: number
  beautyScore?: BeautyScore
  computing?: boolean
  onCompute?: () => void
}

interface Segment {
  key: 'safety' | 'cts'
  title: string
  value: number | null
  color: string
  sublabel: string | null
}

/** Trail Score (TS) v2 e 0-100 (vedi lib/trailScoreV2.ts: CTS * gate(Sicurezza)). Il nome resta
 *  cosi com'e per non dover toccare ogni chiamante che lo importa solo come denominatore del
 *  proprio MiniScoreRing. */
export const TRAIL_SCORE_MAX = 100

function computeSegments(safety: SafetyScore | null, cts: CtsProps): Segment[] {
  const ctsValue = cts.result?.ts ?? cts.cached ?? null
  return [
    { key: 'cts',    title: 'Comfort TrailScore', value: ctsValue,                color: cts.result?.color ?? '#a8a29e', sublabel: ctsValue != null ? ctsLabel(ctsValue).label : null },
    { key: 'safety', title: 'Sicurezza',          value: safety?.overall ?? null, color: safety?.color ?? '#a8a29e',     sublabel: safety?.label ?? null },
  ]
}

/**
 * Calcola il Trail Score v2, 0-100 (lib/trailScoreV2.ts) = Comfort TrailScore * gate(Sicurezza).
 * `total` resta 0 finché Sicurezza/Comfort TrailScore non sono ENTRAMBI disponibili — un gate
 * "assente" non ha un default onesto, quindi niente numero finché non lo sono, invece di uno
 * silenziosamente sbagliato. `value` è il CTS grezzo prima del gate — usato da
 * TrailScoreGaugeBadge per la didascalia "Buon valore, rischio alto" ecc.
 */
export function computeTrailScoreBreakdown(
  safety: SafetyScore | null, cts: CtsProps,
): { total: number; value: number | null } {
  const ctsValue = cts.result?.ts ?? cts.cached ?? null
  const result = computeTrailScoreV2({ cts: ctsValue, safety: safety?.overall ?? null })
  return { total: result?.score ?? 0, value: result?.breakdown.value ?? null }
}

/** Solo il totale — la maggior parte dei chiamanti non ha bisogno del Valore grezzo. */
export function computeTrailScoreTotal(safety: SafetyScore | null, cts: CtsProps): number {
  return computeTrailScoreBreakdown(safety, cts).total
}

/** True quando la Sicurezza e sotto la soglia di veto assoluta (Trail Score v2 spec §2) — usato
 *  per sovrapporre un badge di avviso al numero (non per sostituirlo: il gate sigmoide lo ha gia
 *  schiacciato quasi a zero da solo). */
export function isTrailScoreVetoed(safety: SafetyScore | null): boolean {
  return safety?.overall != null && safety.overall < SAFETY_VETO_THRESHOLD
}

/** TS tier coloring — thresholds sul totale 0-100 (non piu 0-400, vedi TRAIL_SCORE_MAX). */
export function tsColor(value: number): string {
  if (value <= 25) return '#dc2626' // rosso
  if (value <= 50) return '#eab308' // giallo
  if (value <= 75) return '#0ea5e9' // celeste
  return '#16a34a'                  // verde
}

const MINI_STROKE = 3

/** Small circular progress badge for the combined Trail Score — same fill logic as the big
 *  ScoreRing, shrunk down to sit inline among the other stat chips over the map. While the
 *  underlying data is still settling (`loading`), shows a neutral pulsing ring instead of a
 *  number that would otherwise jump several times before landing on its final value. `color`
 *  overrides the automatic TS-tier coloring (used by callers scoring on a different scale,
 *  e.g. Resoconto's 0-10 manual rating). */
export function MiniScoreRing({ value, max = TRAIL_SCORE_MAX, size = 30, loading = false, color: colorOverride, vetoed = false }: { value: number; max?: number; size?: number; loading?: boolean; color?: string; vetoed?: boolean }) {
  const r = (size - MINI_STROKE) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value / max))
  const color = colorOverride ?? tsColor(value)

  if (loading) {
    return (
      <div className="relative shrink-0 rounded-full bg-white shadow-sm animate-pulse" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="#e7e5e4" strokeWidth={MINI_STROKE} />
          <circle
            cx={c} cy={c} r={r} fill="none" stroke="#d6d3d1" strokeWidth={MINI_STROKE} strokeLinecap="round"
            strokeDasharray={`${circumference * 0.25} ${circumference}`}
          />
        </svg>
      </div>
    )
  }

  return (
    <div className="relative shrink-0 rounded-full bg-white shadow-sm" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#e7e5e4" strokeWidth={MINI_STROKE} />
        <circle
          cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={MINI_STROKE} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bold leading-none" style={{ color, fontSize: size * 0.32 }}>{Math.round(value)}</span>
      </div>
      {vetoed && (
        <span
          title="Sconsigliato — rischio elevato"
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-600 text-white leading-none"
          style={{ width: size * 0.4, height: size * 0.4, fontSize: size * 0.28 }}
        >
          ⚠
        </span>
      )}
    </div>
  )
}

// Conta da 0 fino a `target` con easing — usato per il numero centrale del badge, così si "anima"
// anche quando i punteggi arrivano via via, non solo al primo mount.
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return value
}

/**
 * Dettaglio del Trail Score v2 — due righe (Comfort TrailScore, Sicurezza), ognuna apre il
 * proprio foglio a comparsa con il breakdown completo. Niente più radar/poligono: con solo due
 * assi rimasti (Ombra&Acqua e Affidabilità sono stati rimossi) una forma non avrebbe più senso —
 * resta una lista, non un grafico.
 */
export function ScoreRing({ safety, cts }: { safety: SafetyScore | null; cts: CtsProps }) {
  const [activeKey, setActiveKey] = useState<Segment['key'] | null>(null)
  const segments = computeSegments(safety, cts)
  const active = segments.find(s => s.key === activeKey) ?? null

  return (
    <div>
      <div className="w-full space-y-1.5">
        {segments.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveKey(s.key)}
            className="w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-xl transition-colors hover:bg-stone-100"
            style={s.value != null ? { backgroundColor: `${s.color}1a` } : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}33` }} />
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-stone-700 truncate">{s.title}</span>
              {s.sublabel && <span className="block text-[10px] text-stone-400 truncate">{s.sublabel}</span>}
            </span>
            <span className="text-sm font-bold shrink-0" style={{ color: s.value != null ? s.color : '#78716c' }}>{s.value != null ? Math.round(s.value) : '—'}</span>
          </button>
        ))}
      </div>

      <Sheet open={activeKey != null} onClose={() => setActiveKey(null)} title={active?.title}>
        <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
          {active?.key === 'safety' && <SafetyScoreWidget safety={safety} defaultOpen />}
          {active?.key === 'cts' && (
            <ComfortTrailScoreWidget result={cts.result} cached={cts.cached} beautyScore={cts.beautyScore} defaultOpen />
          )}
        </div>
      </Sheet>
    </div>
  )
}
