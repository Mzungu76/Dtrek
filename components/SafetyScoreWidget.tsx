'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle, AlertCircle, Info, Shield, Zap } from 'lucide-react'
import type { SafetyScore } from '@/lib/safetyScore'

function MiniBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden flex-1">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(value / max * 100, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

function CategoryBar({
  icon,
  name,
  score,
  color,
}: {
  icon: string
  name: string
  score: number
  color: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span>{icon}</span>
          {name}
        </span>
        <span className="font-semibold">{Math.round(score)}</span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function WildlifeLegend({ risks }: { risks: ReturnType<typeof import('@/lib/safetyScore').computeSafetyScore>['wildlifeRisks'] }) {
  if (risks.length === 0) return null

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        🦁 Fauna locale
      </p>
      <div className="space-y-2">
        {risks.map(risk => {
          const dangerColor =
            risk.dangerLevel === 'alto'
              ? '#ef4444'
              : risk.dangerLevel === 'moderato'
                ? '#f59e0b'
                : '#10b981'
          const probLabel =
            risk.encounterProbability === 'alta'
              ? '⚠️'
              : risk.encounterProbability === 'media'
                ? '⚡'
                : '✓'

          return (
            <div
              key={risk.animal}
              className="border border-stone-200 rounded-lg p-2.5 bg-white hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-stone-700">
                    {risk.animal}{' '}
                    <span style={{ color: dangerColor }} className="font-bold">
                      {probLabel}
                    </span>
                  </p>
                  <p className="text-[11px] text-stone-500 mt-1">{risk.tip}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RisksLegend({ risks }: { risks: ReturnType<typeof import('@/lib/safetyScore').computeSafetyScore>['allRisks'] }) {
  const dangers = risks.filter(r => r.type === 'danger')
  const warnings = risks.filter(r => r.type === 'warning')
  const infos = risks.filter(r => r.type === 'info')

  if (risks.length === 0) {
    return (
      <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200">
        <p className="text-xs text-emerald-700 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Nessun rischio particolare identificato
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {dangers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Pericoli
          </p>
          {dangers.map((r, i) => (
            <p key={i} className="text-xs text-red-700 pl-5 leading-tight">
              • {r.text}
            </p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" />
            Avvertenze
          </p>
          {warnings.map((r, i) => (
            <p key={i} className="text-xs text-amber-700 pl-5 leading-tight">
              • {r.text}
            </p>
          ))}
        </div>
      )}

      {infos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            Informazioni
          </p>
          {infos.map((r, i) => (
            <p key={i} className="text-xs text-blue-700 pl-5 leading-tight">
              • {r.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export function SafetyScoreWidget({ safety }: { safety: SafetyScore | null }) {
  const [open, setOpen] = useState(false)

  if (!safety) return null

  return (
    <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: safety.color + '14', borderBottom: `2px solid ${safety.color}30` }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Safety Score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black" style={{ color: safety.color }}>
              {safety.overall}
            </span>
            <span className="text-sm font-semibold" style={{ color: safety.color }}>
              {safety.label}
            </span>
          </div>
        </div>
        <div className="ml-auto text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: safety.color }}>
          SAFETY
        </div>
      </div>

      {/* Summary bars */}
      <div className="px-5 py-4 bg-white space-y-3">
        <CategoryBar
          icon="🏔"
          name="Quota"
          score={safety.categories.altitude.score}
          color="#8b5cf6"
        />
        <CategoryBar
          icon="🗺"
          name="Terreno"
          score={safety.categories.terrain.score}
          color="#ec4899"
        />
        <CategoryBar
          icon="☀️"
          name="Esposizione"
          score={safety.categories.exposure.score}
          color="#f59e0b"
        />
        <CategoryBar
          icon="🦁"
          name="Fauna"
          score={safety.categories.wildlife.score}
          color="#10b981"
        />
        <CategoryBar
          icon="🚁"
          name="Logistica"
          score={safety.categories.logistics.score}
          color="#0ea5e9"
        />

        {/* Toggle details */}
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-center gap-1 pt-1 text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
        >
          {open ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Nascondi dettagli
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Mostra dettagli
            </>
          )}
        </button>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-stone-100 bg-stone-50 px-5 py-4 space-y-6">
          <WildlifeLegend risks={safety.wildlifeRisks} />
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              ⚠️ Analisi rischi
            </p>
            <RisksLegend risks={safety.allRisks} />
          </div>
        </div>
      )}
    </div>
  )
}
