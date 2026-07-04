'use client'
import { useState } from 'react'
import type { CLLabel, CLSignals } from '@/lib/cl/types'
import type { SafetyScore } from '@/lib/safetyScore'
import type { TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { CLBadge } from '@/components/CLBadge'
import { SafetyScoreWidget } from '@/components/SafetyScoreWidget'
import { ComfortTrailScoreWidget } from '@/components/ComfortTrailScoreWidget'
import Sheet from '@/components/ui/Sheet'

interface CLProps {
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

interface CtsProps {
  result: TrailScoreResult | null
  cached?: number
  beautyScore?: BeautyScore
  computing?: boolean
  onCompute?: () => void
}

interface Segment {
  key: 'cl' | 'safety' | 'cts' | 'beauty'
  title: string
  value: number | null
  color: string
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

const GAP_DEG = 4
const SIZE    = 176
const R       = 72
const STROKE  = 22
const CX      = SIZE / 2
const CY      = SIZE / 2

/**
 * Grafico ad anello che sostituisce la griglia a 4 tile di ScoresSection: un solo
 * elemento compatto invece di una dashboard a sé, coerente con l'idea che tutta
 * l'infrastruttura di valutazione (CL, Sicurezza, Comfort TrailScore, Bellezza/TEI)
 * resti consultabile ma non occupi una sezione propria. Click su uno spicchio apre
 * il dettaglio del punteggio corrispondente in un foglio a comparsa.
 */
export function ScoreRing({
  cl, safety, cts,
}: {
  cl: CLProps
  safety: SafetyScore | null
  cts: CtsProps
}) {
  const [activeKey, setActiveKey] = useState<Segment['key'] | null>(null)

  const ctsValue    = cts.result?.ts ?? cts.cached ?? null
  const beautyValue = cts.result?.b != null
    ? cts.result.b * 10
    : cts.beautyScore?.overall != null ? cts.beautyScore.overall * 10 : null

  const segments: Segment[] = [
    { key: 'cl',     title: 'Livello di affidabilità', value: cl.notMatched || cl.loading ? null : cl.si ?? null, color: colorForCL(cl.label) },
    { key: 'safety', title: 'Sicurezza',                value: safety?.overall ?? null,                          color: safety?.color ?? '#a8a29e' },
    { key: 'cts',    title: 'Comfort TrailScore',       value: ctsValue,                                          color: cts.result?.color ?? '#a8a29e' },
    { key: 'beauty', title: 'Bellezza del percorso',    value: beautyValue,                                       color: cts.beautyScore?.color ?? '#059669' },
  ]

  const total   = segments.reduce((sum, s) => sum + (s.value ?? 0), 0)
  const known   = segments.filter(s => s.value != null).length
  const active  = segments.find(s => s.key === activeKey) ?? null
  const span    = 90 - GAP_DEG

  return (
    <div className="rounded-2xl border border-stone-200 shadow-sm bg-white p-5">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {segments.map((s, i) => {
              const start = i * 90 + GAP_DEG / 2
              const pct   = s.value != null ? Math.max(0, Math.min(100, s.value)) / 100 : 0
              return (
                <g key={s.key}>
                  <path
                    d={arcPath(CX, CY, R, start, start + span)}
                    stroke="#f1efe9" strokeWidth={STROKE} strokeLinecap="round" fill="none"
                  />
                  {s.value != null && (
                    <path
                      d={arcPath(CX, CY, R, start, start + span * pct)}
                      stroke={s.color} strokeWidth={STROKE} strokeLinecap="round" fill="none"
                      style={{ transition: 'stroke-dasharray 300ms ease' }}
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
            <span className="font-black text-2xl text-stone-800 leading-none">{Math.round(total)}</span>
            <span className="text-[10px] text-stone-400 font-semibold mt-0.5">su {known * 100 || 400}</span>
          </div>
        </div>

        <div className="flex-1 min-w-[160px] space-y-2">
          {segments.map(s => (
            <button
              key={s.key}
              onClick={() => s.value != null && setActiveKey(s.key)}
              disabled={s.value == null}
              className="w-full flex items-center gap-2.5 text-left disabled:opacity-40"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="flex-1 text-xs text-stone-600 truncate">{s.title}</span>
              <span className="text-xs font-bold text-stone-800">{s.value != null ? Math.round(s.value) : '—'}</span>
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
        </div>
      </Sheet>
    </div>
  )
}
