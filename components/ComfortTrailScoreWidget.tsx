'use client'
import { useState } from 'react'
import { ctsLabel, type TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { ChevronDown, ChevronUp } from 'lucide-react'

// ── mini bar ──────────────────────────────────────────────────────────────────

function MiniBar({ value, max = 10, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden flex-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value / max * 100, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

// ── Beauty breakdown ──────────────────────────────────────────────────────────

function BeautyLegend({ beauty, b }: { beauty: BeautyScore; b: number }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Dettaglio Bellezza</p>
      {beauty.categories.map(cat => (
        <div key={cat.key}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs w-4 text-center">{cat.emoji}</span>
            <span className="text-xs text-stone-600 flex-1">{cat.label}</span>
            <span className="text-[11px] font-semibold" style={{ color: cat.color }}>{cat.score.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <MiniBar value={cat.score} color={cat.color} />
          </div>
          {cat.reasons.length > 0 && (
            <p className="pl-6 text-[10px] text-stone-400 mt-0.5 leading-tight">
              {cat.reasons.slice(0, 2).join(' · ')}
            </p>
          )}
        </div>
      ))}
      <div className="mt-1 pt-2 border-t border-stone-100 flex items-center gap-2">
        <span className="text-xs text-stone-500 flex-1">Punteggio complessivo</span>
        <span className="text-xs font-bold text-emerald-700">{b.toFixed(1)} / 10</span>
      </div>
    </div>
  )
}

// ── Effort breakdown ──────────────────────────────────────────────────────────

function EffortLegend({ bd }: { bd: TrailScoreResult['breakdown'] }) {
  const tTot = bd.tNaismith + bd.tDesc
  const tTotAlt = tTot * bd.altPhysioMult * bd.terrainMult

  function fmtH(h: number) {
    const m = Math.round(h * 60)
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'min' : ''}`
  }

  const rows: [string, string, string][] = [
    ['🏃', 'Distanza',         fmtH(bd.tNaismith)],
    ['⛰',  'Dislivello +',    fmtH(bd.tDesc)],
  ]
  if (bd.altPhysioMult > 1.01)
    rows.push(['🏔', `Quota alta (×${bd.altPhysioMult.toFixed(2)})`, ''])
  if (bd.terrainMult > 1.01)
    rows.push(['🗺', `Terreno: ${bd.terrainLabel} (×${bd.terrainMult.toFixed(2)})`, ''])

  const deltaLabel =
    bd.deltaSource === 'hr'       ? '⌚ FC attività' :
    bd.deltaSource === 'personal' ? '📊 Profilo storico' : null

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Dettaglio Fatica</p>

      <div className="space-y-1.5">
        {rows.map(([icon, label, val]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-xs w-4 text-center">{icon}</span>
            <span className="text-xs text-stone-600 flex-1">{label}</span>
            {val && <span className="text-[11px] text-stone-500">{val}</span>}
          </div>
        ))}
      </div>

      <div className="pt-1.5 border-t border-stone-100 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 flex-1">Tempo stimato</span>
          <span className="text-[11px] text-stone-600">{fmtH(tTotAlt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 flex-1">Fatica standard</span>
          <span className="text-[11px] font-semibold text-orange-600">{bd.fStd.toFixed(1)} / 10</span>
        </div>
        {deltaLabel && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 flex-1">Correzione {deltaLabel}</span>
            <span className="text-[11px] font-semibold" style={{ color: bd.delta >= 0 ? '#dc2626' : '#16a34a' }}>
              {bd.delta >= 0 ? '+' : ''}{(bd.delta * 100).toFixed(0)}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 flex-1">Fatica corretta</span>
          <span className="text-xs font-bold text-orange-700">{bd.fFinal.toFixed(1)} / 10</span>
        </div>
      </div>

      {(bd.sfidaBonus !== 0 || bd.duraBonus !== 0) && (
        <div className="pt-1.5 border-t border-stone-100 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Bonus preferenze</p>
          {bd.sfidaBonus !== 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500 flex-1">💪 Sfida</span>
              <span className="text-[11px]" style={{ color: bd.sfidaBonus >= 0 ? '#059669' : '#dc2626' }}>
                {bd.sfidaBonus >= 0 ? '+' : ''}{Math.round(bd.sfidaBonus)} pt
              </span>
            </div>
          )}
          {bd.duraBonus !== 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500 flex-1">⏱ Durata</span>
              <span className="text-[11px]" style={{ color: bd.duraBonus >= 0 ? '#059669' : '#dc2626' }}>
                {bd.duraBonus >= 0 ? '+' : ''}{Math.round(bd.duraBonus)} pt
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function ComfortTrailScoreWidget({
  result, cached, beautyScore,
}: {
  result: TrailScoreResult | null
  cached?: number
  beautyScore?: BeautyScore
}) {
  const [open, setOpen] = useState(false)
  const ts = result?.ts ?? cached
  if (ts === undefined) return null
  const { label, color } = result ?? ctsLabel(ts)
  const bd = result?.breakdown
  const hasDetail = !!bd

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

      {/* Summary bars */}
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
          {/* Delta source note */}
          {bd.deltaSource !== 'none' && (
            <p className="text-[10px] text-stone-400 italic">
              {bd.deltaSource === 'hr' ? '⌚ Corretto con FC attività' :
               bd.deltaSource === 'personal' ? '📊 Corretto con profilo storico' : ''}
            </p>
          )}

          {/* Toggle legenda */}
          {hasDetail && (
            <button
              onClick={() => setOpen(v => !v)}
              className="w-full flex items-center justify-center gap-1 pt-1 text-[11px] text-stone-400 hover:text-stone-600 transition-colors"
            >
              {open ? <><ChevronUp className="w-3.5 h-3.5" /> Nascondi dettagli</> : <><ChevronDown className="w-3.5 h-3.5" /> Mostra dettagli</>}
            </button>
          )}
        </div>
      )}

      {/* Expanded legend */}
      {open && bd && (
        <div className="border-t border-stone-100 bg-stone-50 px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {beautyScore && <BeautyLegend beauty={beautyScore} b={result!.b} />}
          <EffortLegend bd={bd} />
        </div>
      )}
    </div>
  )
}
