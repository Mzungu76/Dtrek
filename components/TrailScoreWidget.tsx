'use client'
import { tsLabel, type TrailScoreResult } from '@/lib/trailScore'

export function TrailScoreWidget({ result, cached }: {
  result: TrailScoreResult | null
  cached?: number
}) {
  const ts = result?.ts !== undefined ? result.ts : cached
  if (ts === undefined) return null
  const { label, color } = result ? result : tsLabel(ts)
  const bd = result?.breakdown

  return (
    <div className="rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-4"
        style={{ background: `linear-gradient(135deg,${color}22,${color}08)`, borderBottom: `2px solid ${color}35` }}>
        <div className="text-center shrink-0">
          <div className="text-5xl font-bold leading-none" style={{ color }}>{ts}</div>
          <div className="text-[10px] text-stone-400 mt-0.5">/ 100</div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">TrailScore</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: color }}>{label}</span>
          </div>
          {bd && (
            <p className="text-[10px] text-stone-400 mt-0.5">
              Bellezza {result!.b}/10 · Fatica {bd.fFinal}/10
            </p>
          )}
        </div>
      </div>

      {bd && (
        <>
          {/* Barre principali */}
          <div className="bg-white px-6 py-4 grid grid-cols-2 gap-5">
            {/* Bellezza */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-stone-500">🌄 Bellezza</span>
                <span className="text-xs font-bold text-stone-800">{result!.b.toFixed(1)}/10</span>
              </div>
              <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-forest-500 transition-all"
                  style={{ width: `${result!.b * 10}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-stone-400">
                <span>🌿 Natura {bd.b1.toFixed(1)}</span>
                <span>🏛 Cultura {bd.b2.toFixed(1)}</span>
              </div>
            </div>

            {/* Fatica */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-stone-500">⚡ Fatica</span>
                <div className="flex items-center gap-1">
                  {bd.deltaEff !== 0 && (
                    <span className="text-[10px] text-stone-300 line-through">{bd.fStd.toFixed(1)}</span>
                  )}
                  <span className="text-xs font-bold text-stone-800">{bd.fFinal.toFixed(1)}/10</span>
                </div>
              </div>
              <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden relative">
                {bd.deltaEff !== 0 && (
                  <div className="h-full rounded-full bg-stone-300 absolute inset-0"
                    style={{ width: `${bd.fStd * 10}%` }} />
                )}
                <div className="h-full rounded-full bg-terra-500 relative transition-all"
                  style={{ width: `${bd.fFinal * 10}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-2 mt-1 text-[10px] text-stone-400">
                <span>⛰️ Std {bd.fStd.toFixed(1)}</span>
                <span>⏱ {bd.tNaismith.toFixed(1)}h</span>
                {bd.deltaEff !== 0 && (
                  <span style={{ color: bd.deltaEff > 0 ? '#dc2626' : bd.deltaEff < 0 ? '#16a34a' : '#a8a29e' }}>
                    👤 {bd.deltaEff > 0 ? '+' : ''}{bd.deltaEff.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Legenda parametri — grid emoji stile beauty score */}
          <div className="bg-stone-50 border-t border-stone-100 px-6 py-3">
            <div className="grid grid-cols-5 gap-2 text-center">
              <div>
                <div className="text-base">🌿</div>
                <div className="text-xs font-bold text-stone-700 mt-0.5">{bd.b1.toFixed(1)}</div>
                <div className="text-[9px] text-stone-400 leading-tight">Natura</div>
              </div>
              <div>
                <div className="text-base">🏛</div>
                <div className="text-xs font-bold text-stone-700 mt-0.5">{bd.b2.toFixed(1)}</div>
                <div className="text-[9px] text-stone-400 leading-tight">Cultura</div>
              </div>
              <div>
                <div className="text-base">⛰️</div>
                <div className="text-xs font-bold text-stone-700 mt-0.5">{bd.fStd.toFixed(1)}</div>
                <div className="text-[9px] text-stone-400 leading-tight">Fatica std</div>
              </div>
              <div>
                <div className="text-base">⏱</div>
                <div className="text-xs font-bold text-stone-700 mt-0.5">{bd.tNaismith.toFixed(1)}h</div>
                <div className="text-[9px] text-stone-400 leading-tight">Tempo std</div>
              </div>
              <div>
                <div className="text-base">{bd.terrainLabel.startsWith('T') ? '🧗' : '🥾'}</div>
                <div className="text-xs font-bold text-stone-700 mt-0.5">×{bd.terrainMult.toFixed(2)}</div>
                <div className="text-[9px] text-stone-400 leading-tight capitalize">{bd.terrainLabel}</div>
              </div>
            </div>
          </div>

          {/* Bonus preferenze */}
          {(bd.sfidaBonus !== 0 || bd.ritmoBonus !== 0) && (
            <div className="border-t border-stone-100 px-6 py-2.5 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
              {bd.sfidaBonus !== 0 && (
                <span>{bd.sfidaBonus > 0 ? '⚡' : '🚶'} {bd.sfidaBonus > 0 ? 'Sfida' : 'Passeggiata'}: {bd.sfidaBonus > 0 ? '+' : ''}{bd.sfidaBonus} pts</span>
              )}
              {bd.ritmoBonus !== 0 && (
                <span>{bd.ritmoBonus > 0 ? '⚡' : '🐢'} {bd.ritmoBonus > 0 ? 'Efficiente' : 'Contemplativo'}: {bd.ritmoBonus > 0 ? '+' : ''}{bd.ritmoBonus} pts</span>
              )}
            </div>
          )}

          {/* Correzione personale */}
          {bd.deltaSource !== 'none' && (
            <div className="border-t border-stone-100 px-6 py-2.5 text-xs text-stone-500 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">
                {bd.deltaSource === 'hr' ? '❤️' : '👤'}
              </span>
              <span>
                {bd.deltaSource === 'hr'
                  ? `Correzione FC: FC media ${Math.round((bd.delta * 10) + (50 + bd.fStd * 4))}% vs attesa ${Math.round(50 + bd.fStd * 4)}% → fatica ${bd.deltaEff > 0 ? 'aumentata' : 'ridotta'} di ${Math.abs(bd.deltaEff).toFixed(1)} (peso difficoltà ×${bd.difficultyW.toFixed(2)})`
                  : `Correzione profilo: FCmax ${bd.userFCmax} bpm vs standard ${185} bpm → ${bd.deltaEff > 0 ? 'percorso più impegnativo del previsto' : 'percorso meno impegnativo del previsto'} (${bd.deltaEff > 0 ? '+' : ''}${bd.deltaEff.toFixed(1)} su fatica)`
                }
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
