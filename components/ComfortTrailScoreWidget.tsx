'use client'
import { ctsLabel, type TrailScoreResult } from '@/lib/trailScore'

export function ComfortTrailScoreWidget({
  result, cached
}: { result: TrailScoreResult | null; cached?: number }) {
  const ts = result?.ts ?? cached
  if (ts === undefined) return null
  const { label, color } = result ?? ctsLabel(ts)
  const bd = result?.breakdown

  return (
    <div className="rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ background: color + '14', borderBottom: `2px solid ${color}30` }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Comfort TrailScore</p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black" style={{ color }}>{Math.round(ts)}</span>
            <span className="text-sm font-semibold" style={{ color }}>{label}</span>
          </div>
        </div>
        <div className="ml-auto text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ backgroundColor: color }}>CTS</div>
      </div>

      {/* Breakdown (only if result available) */}
      {bd && (
        <div className="px-5 py-4 bg-white space-y-3">
          {/* Beauty bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-stone-500">
              <span>🌄 Bellezza</span>
              <span className="font-semibold">{result!.b.toFixed(1)}/10</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${result!.b * 10}%` }} />
            </div>
          </div>
          {/* Effort bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-stone-500">
              <span>💪 Fatica</span>
              <span className="font-semibold">{bd.fFinal.toFixed(1)}/10</span>
            </div>
            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange-400 rounded-full" style={{ width: `${bd.fFinal * 10}%` }} />
            </div>
          </div>
          {/* Source tag */}
          {bd.deltaSource !== 'none' && (
            <p className="text-[10px] text-stone-400 italic">
              {bd.deltaSource === 'hr' ? '⌚ Corretto con FC attività' :
               bd.deltaSource === 'personal' ? '📊 Corretto con profilo storico' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
