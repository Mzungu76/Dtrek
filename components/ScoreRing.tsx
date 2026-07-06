'use client'
import { useState } from 'react'
import type { CLLabel, CLSignals, Sentinel2Data } from '@/lib/cl/types'
import type { SafetyScore } from '@/lib/safetyScore'
import type { TrailScoreResult } from '@/lib/trailScore'
import { ctsLabel } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { CLBadge } from '@/components/CLBadge'
import { SafetyScoreWidget } from '@/components/SafetyScoreWidget'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import { ShadeWaterTile } from '@/components/ShadeWaterTile'
import Sheet from '@/components/ui/Sheet'

export interface CLProps {
  si?: number
  label?: CLLabel
  signals?: CLSignals
  isGhostTrail?: boolean
  partial?: boolean
  loading?: boolean
  notMatched?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  refreshError?: string | null
}

export interface CtsProps {
  result: TrailScoreResult | null
  cached?: number
  beautyScore?: BeautyScore
  computing?: boolean
  onCompute?: () => void
}

export interface ShadeWaterProps {
  data: Sentinel2Data | null
  loading?: boolean
}

interface Segment {
  key: 'cl' | 'safety' | 'cts' | 'beauty' | 'shadewater'
  title: string
  value: number | null
  color: string
}

/** Max possible value of the combined Trail Score (TS) — one of these 5 segments, each capped
 *  at 100, summed together. */
export const TRAIL_SCORE_MAX = 500

function computeSegments(cl: CLProps, safety: SafetyScore | null, cts: CtsProps, shadeWater: ShadeWaterProps): Segment[] {
  const ctsValue    = cts.result?.ts ?? cts.cached ?? null
  const beautyValue = cts.result?.b != null
    ? cts.result.b * 10
    : cts.beautyScore?.overall != null ? cts.beautyScore.overall * 10 : null
  const shadeWaterValue = shadeWater.data?.available && shadeWater.data.shadeScore != null
    ? shadeWater.data.shadeScore * 100 : null

  return [
    { key: 'cl',         title: 'Livello di affidabilità', value: cl.notMatched || cl.loading ? null : cl.si ?? null, color: colorForCL(cl.label) },
    { key: 'safety',     title: 'Sicurezza',                value: safety?.overall ?? null,                          color: safety?.color ?? '#a8a29e' },
    { key: 'cts',        title: 'Comfort TrailScore',       value: ctsValue,                                          color: cts.result?.color ?? '#a8a29e' },
    { key: 'beauty',     title: 'Bellezza del percorso',    value: beautyValue,                                       color: cts.beautyScore?.color ?? '#059669' },
    { key: 'shadewater', title: 'Ombra e acqua',            value: shadeWaterValue,                                   color: '#0ea5e9' },
  ]
}

/** Combined "TS" (Trail Score) shown as a compact badge — sum of every known segment (CL,
 *  Sicurezza, Comfort TrailScore, Bellezza, Ombra e acqua), each capped at 100, out of
 *  TRAIL_SCORE_MAX (500). Same figure as ScoreRing's own central number, computed the same way
 *  so the two never disagree. */
export function computeTrailScoreTotal(cl: CLProps, safety: SafetyScore | null, cts: CtsProps, shadeWater: ShadeWaterProps): number {
  return computeSegments(cl, safety, cts, shadeWater).reduce((sum, s) => sum + (s.value ?? 0), 0)
}

const MINI_STROKE = 3

/** Small circular progress badge for the combined Trail Score — same fill logic as the big
 *  ScoreRing, shrunk down to sit inline among the other stat chips over the map. */
export function MiniScoreRing({ value, max = TRAIL_SCORE_MAX, size = 30 }: { value: number; max?: number; size?: number }) {
  const r = (size - MINI_STROKE) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value / max))
  const { color } = ctsLabel(Math.round(pct * 100))
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
    </div>
  )
}

function colorForCL(label?: CLLabel): string {
  switch (label?.color) {
    case 'green': return '#277134'
    case 'lime': return '#65a30d'
    case 'amber': return '#d97706'
    case 'red': return '#dc2626'
    default: return '#a8a29e'
  }
}

// Punto sul cerchio per un angolo in gradi, 0° = ore 12, in senso orario.
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const span = endDeg - startDeg
  if (span <= 0) return ''
  const start = polar(cx, cy, r, startDeg)
  const end   = polar(cx, cy, r, endDeg)
  const largeArc = span > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

const GAP_DEG   = 4
const SEG_COUNT = 5
const SEG_DEG   = 360 / SEG_COUNT
const SIZE      = 208
const R         = 86
const STROKE    = 18
const CX        = SIZE / 2
const CY        = SIZE / 2

/**
 * Grafico ad anello che sostituisce la griglia a tile di ScoresSection: un solo
 * elemento compatto invece di una dashboard a sé, coerente con l'idea che tutta
 * l'infrastruttura di valutazione (CL, Sicurezza, Comfort TrailScore, Bellezza/TEI,
 * Ombra e acqua) resti consultabile ma non occupi una sezione propria. Click su
 * uno spicchio apre il dettaglio del punteggio corrispondente in un foglio a comparsa.
 */
export function ScoreRing({
  cl, safety, cts, shadeWater,
}: {
  cl: CLProps
  safety: SafetyScore | null
  cts: CtsProps
  shadeWater: ShadeWaterProps
}) {
  const [activeKey, setActiveKey] = useState<Segment['key'] | null>(null)

  const segments = computeSegments(cl, safety, cts, shadeWater)
  const total   = segments.reduce((sum, s) => sum + (s.value ?? 0), 0)
  const known   = segments.filter(s => s.value != null).length
  const active  = segments.find(s => s.key === activeKey) ?? null
  const span    = SEG_DEG - GAP_DEG

  return (
    <div>
      <div className="flex flex-col items-center gap-5">
        <div className="relative shrink-0 mx-auto" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {segments.map((s, i) => {
              const start = i * SEG_DEG + GAP_DEG / 2
              const pct   = s.value != null ? Math.max(0, Math.min(100, s.value)) / 100 : 0
              return (
                <g key={s.key}>
                  <path
                    d={arcPath(CX, CY, R, start, start + span)}
                    stroke="#e7e5e4" strokeWidth={STROKE} strokeLinecap="round" fill="none"
                  />
                  {s.value != null && (
                    <path
                      d={arcPath(CX, CY, R, start, start + span * pct)}
                      stroke={s.color} strokeWidth={STROKE} strokeLinecap="round" fill="none"
                      style={{ transition: 'stroke-dasharray 300ms ease', filter: `drop-shadow(0 0 5px ${s.color}aa)` }}
                    />
                  )}
                  <path
                    d={arcPath(CX, CY, R, start, start + span)}
                    stroke="transparent" strokeWidth={STROKE + 14} fill="none"
                    style={{ cursor: s.value != null ? 'pointer' : 'default' }}
                    onClick={() => s.value != null && setActiveKey(s.key)}
                  />
                </g>
              )
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Punteggio</span>
            <span className="font-display font-black text-[30px] text-stone-900 leading-none mt-0.5">{Math.round(total)}</span>
            <span className="text-[10px] text-stone-400 font-semibold mt-0.5">su {known * 100 || SEG_COUNT * 100}</span>
          </div>
        </div>

        <div className="w-full space-y-1.5">
          {segments.map(s => (
            <button
              key={s.key}
              onClick={() => s.value != null && setActiveKey(s.key)}
              disabled={s.value == null}
              className="w-full flex items-center gap-2.5 text-left px-2.5 py-1.5 rounded-xl transition-colors disabled:opacity-40 hover:bg-stone-100"
              style={s.value != null ? { backgroundColor: `${s.color}1a` } : undefined}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 0 3px ${s.color}33` }} />
              <span className="flex-1 text-xs text-stone-700 truncate">{s.title}</span>
              <span className="text-sm font-bold" style={{ color: s.value != null ? s.color : '#78716c' }}>{s.value != null ? Math.round(s.value) : '—'}</span>
            </button>
          ))}
        </div>
      </div>

      <Sheet open={!!active} onClose={() => setActiveKey(null)} title={active?.title}>
        <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
          {active?.key === 'cl' && (
            <CLBadge
              si={cl.si} label={cl.label} signals={cl.signals} isGhostTrail={cl.isGhostTrail}
              partial={cl.partial} loading={cl.loading} expanded defaultOpen
              onRefresh={cl.onRefresh} refreshing={cl.refreshing} refreshError={cl.refreshError}
            />
          )}
          {active?.key === 'safety' && <SafetyScoreWidget safety={safety} defaultOpen />}
          {active?.key === 'cts' && (
            <ComfortTrailScoreWidget result={cts.result} cached={cts.cached} beautyScore={cts.beautyScore} defaultOpen />
          )}
          {active?.key === 'beauty' && (
            <ComfortTrailScoreWidget result={cts.result} cached={cts.cached} beautyScore={cts.beautyScore} defaultOpen />
          )}
          {active?.key === 'shadewater' && (
            <ShadeWaterTile data={shadeWater.data} loading={shadeWater.loading} defaultOpen />
          )}
        </div>
      </Sheet>
    </div>
  )
}
