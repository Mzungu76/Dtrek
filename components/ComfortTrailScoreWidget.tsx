'use client'
import { useState } from 'react'
import {
  Leaf, Mountain, Landmark, Castle, BookOpen, BarChart3, Building2,
  Footprints, TrendingUp, Map, Watch, Dumbbell, Timer, Trophy, type LucideIcon,
} from 'lucide-react'
import { ctsLabel, type TrailScoreResult } from '@/lib/trailScore'
import type { BeautyScore } from '@/lib/beautyScore'
import { InfoTooltip } from '@/components/InfoTooltip'
import { ScoreTile } from '@/components/ScoreTile'
import { CTS_PARAM_DESCRIPTIONS } from '@/lib/ctsParamDescriptions'

// Le categorie Bellezza/TEI arrivano da lib/beautyScore.ts/lib/tei.ts con un campo `emoji` (reso
// in modo incoerente tra piattaforme, come già risolto per i pin POI in components/poiIcons.tsx)
// — qui si mappa la stessa chiave a un'icona lucide-react senza toccare quei dati condivisi.
const CAT_ICON: Record<string, LucideIcon> = {
  natura: Leaf,
  paesaggio: Mountain,
  archeologia: Landmark,
  architettura: Castle,
  interesse: BookOpen,
  tei_raw: BarChart3,
  f_antr: Building2,
}

function CatIcon({ catKey }: { catKey: string }) {
  const Icon = CAT_ICON[catKey] ?? Leaf
  return <Icon className="w-3.5 h-3.5 text-stone-500 shrink-0" strokeWidth={2.25} />
}

// ── mini bar ──────────────────────────────────────────────────────────────────

function MiniBar({ value, max = 10, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden flex-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value / max * 100, 100)}%`, backgroundColor: color }} />
    </div>
  )
}

// ── Beauty / TEI breakdown ────────────────────────────────────────────────────

function BeautyLegend({ beauty, b }: { beauty: BeautyScore; b: number }) {
  const isTei = beauty.version === 2
  const mainCats = beauty.categories.filter(c => c.key !== 'f_antr' && c.key !== 'tei_raw')
  const rawCat   = beauty.categories.find(c => c.key === 'tei_raw')
  const antrCat  = beauty.categories.find(c => c.key === 'f_antr')

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        {isTei ? 'Dettaglio TEI' : 'Dettaglio Bellezza'}
      </p>
      {mainCats.map(cat => (
        <div key={cat.key}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="w-4 flex justify-center"><CatIcon catKey={cat.key} /></span>
            <span className="text-xs text-stone-600 flex-1">{cat.label}</span>
            <InfoTooltip text={CTS_PARAM_DESCRIPTIONS[cat.key] ?? CTS_PARAM_DESCRIPTIONS.beautyCategory} />
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

      {/* Anthropic penalty explanation — shown only when f_antr > 0 */}
      {rawCat && antrCat && (
        <div className="mt-1 pt-2 border-t border-stone-100 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Penalità ambiente</p>
          <div className="flex items-center gap-2">
            <span className="w-4 flex justify-center"><CatIcon catKey={rawCat.key} /></span>
            <span className="text-xs text-stone-500 flex-1">{rawCat.label}</span>
            <InfoTooltip text={CTS_PARAM_DESCRIPTIONS.anthropicRaw} />
            <span className="text-[11px] text-stone-600">{rawCat.score.toFixed(1)} / 10</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 flex justify-center"><CatIcon catKey={antrCat.key} /></span>
            <span className="text-xs text-stone-500 flex-1">{antrCat.label}</span>
            <InfoTooltip text={CTS_PARAM_DESCRIPTIONS.anthropicPenalty} />
            <span className="text-[11px] font-semibold" style={{ color: antrCat.color }}>{antrCat.gradeLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 flex-1 pl-6">Punteggio finale</span>
            <span className="text-xs font-bold text-emerald-700">{b.toFixed(1)} / 10</span>
          </div>
        </div>
      )}

      {!antrCat && (
        <div className="mt-1 pt-2 border-t border-stone-100 flex items-center gap-2">
          <span className="text-xs text-stone-500 flex-1">Punteggio complessivo</span>
          <span className="text-xs font-bold text-emerald-700">{b.toFixed(1)} / 10</span>
        </div>
      )}
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

  const rows: [LucideIcon, string, string, string][] = [
    [Footprints, 'Distanza',         fmtH(bd.tNaismith), 'effortDistance'],
    [TrendingUp, 'Dislivello +',    fmtH(bd.tDesc), 'effortGain'],
  ]
  if (bd.altPhysioMult > 1.01)
    rows.push([Mountain, `Quota alta (×${bd.altPhysioMult.toFixed(2)})`, '', 'effortAltitude'])
  if (bd.terrainMult > 1.01)
    rows.push([Map, `Terreno: ${bd.terrainLabel} (×${bd.terrainMult.toFixed(2)})`, '', 'effortTerrain'])

  const DeltaIcon  = bd.deltaSource === 'hr' ? Watch : bd.deltaSource === 'personal' ? BarChart3 : null
  const deltaLabel = bd.deltaSource === 'hr' ? 'FC attività' : bd.deltaSource === 'personal' ? 'Profilo storico' : null

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Dettaglio Fatica</p>

      <div className="space-y-1.5">
        {rows.map(([Icon, label, val, kind]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-4 flex justify-center"><Icon className="w-3.5 h-3.5 text-stone-500 shrink-0" strokeWidth={2.25} /></span>
            <span className="text-xs text-stone-600 flex-1">{label}</span>
            <InfoTooltip text={CTS_PARAM_DESCRIPTIONS[kind]} />
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
          <InfoTooltip text={CTS_PARAM_DESCRIPTIONS.effortStandard} />
          <span className="text-[11px] font-semibold text-orange-600">{bd.fStd.toFixed(1)} / 10</span>
        </div>
        {deltaLabel && DeltaIcon && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 flex-1 flex items-center gap-1">
              Correzione <DeltaIcon className="w-3 h-3 shrink-0" strokeWidth={2.25} /> {deltaLabel}
            </span>
            <InfoTooltip text={CTS_PARAM_DESCRIPTIONS.effortDelta} />
            <span className="text-[11px] font-semibold" style={{ color: bd.delta >= 0 ? '#dc2626' : '#16a34a' }}>
              {bd.delta >= 0 ? '+' : ''}{(bd.delta * 100).toFixed(0)}%
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 flex-1">Fatica corretta</span>
          <InfoTooltip text={CTS_PARAM_DESCRIPTIONS.effortFinal} />
          <span className="text-xs font-bold text-orange-700">{bd.fFinal.toFixed(1)} / 10</span>
        </div>
      </div>

      {(bd.sfidaBonus !== 0 || bd.duraBonus !== 0) && (
        <div className="pt-1.5 border-t border-stone-100 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Bonus preferenze</p>
          {bd.sfidaBonus !== 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500 flex-1 flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} /> Sfida</span>
              <InfoTooltip text={CTS_PARAM_DESCRIPTIONS.bonusSfida} />
              <span className="text-[11px]" style={{ color: bd.sfidaBonus >= 0 ? '#059669' : '#dc2626' }}>
                {bd.sfidaBonus >= 0 ? '+' : ''}{Math.round(bd.sfidaBonus)} pt
              </span>
            </div>
          )}
          {bd.duraBonus !== 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500 flex-1 flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} /> Durata</span>
              <InfoTooltip text={CTS_PARAM_DESCRIPTIONS.bonusDurata} />
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
  result, cached, beautyScore, defaultOpen,
}: {
  result: TrailScoreResult | null
  cached?: number
  beautyScore?: BeautyScore
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const ts = result?.ts ?? cached
  if (ts === undefined) return null
  const { label, color } = result ?? ctsLabel(ts)
  const bd = result?.breakdown
  const hasDetail = !!bd

  return (
    <ScoreTile
      title="Comfort TrailScore"
      score={Math.round(ts)}
      label={label}
      color={color}
      badge="CTS"
      open={open}
      onToggle={() => setOpen(v => !v)}
      hasDetail={hasDetail}
    >
      {bd && (
        <div className="space-y-4">
          <div className="space-y-3">
            {/* Beauty / TEI bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-stone-500">
                <span className="flex items-center gap-1.5">
                  {beautyScore?.version === 2 ? <Trophy className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} /> : <Mountain className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />}
                  {beautyScore?.version === 2 ? 'TEI' : 'Bellezza'}
                </span>
                <span className="font-semibold">{result!.b.toFixed(1)}/10</span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${result!.b * 10}%` }} />
              </div>
            </div>
            {/* Effort bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-stone-500">
                <span className="flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} /> Fatica</span>
                <span className="font-semibold">{bd.fFinal.toFixed(1)}/10</span>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${bd.fFinal * 10}%` }} />
              </div>
            </div>
            {/* Delta source note */}
            {bd.deltaSource !== 'none' && (
              <p className="text-[10px] text-stone-400 italic flex items-center gap-1">
                {bd.deltaSource === 'hr' ? <Watch className="w-3 h-3 shrink-0" strokeWidth={2.25} /> : <BarChart3 className="w-3 h-3 shrink-0" strokeWidth={2.25} />}
                {bd.deltaSource === 'hr' ? 'Corretto con FC attività' : 'Corretto con profilo storico'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {beautyScore && <BeautyLegend beauty={beautyScore} b={result!.b} />}
            <EffortLegend bd={bd} />
          </div>
        </div>
      )}
    </ScoreTile>
  )
}
