'use client'
import { Leaf } from 'lucide-react'
import type { FloraResult } from '@/lib/floraTypes'
import { textPrimary, textMuted } from '@/components/routehub/overlayTheme'

const LEAF_TYPE_LABEL: Record<string, string> = {
  broadleaved: 'Latifoglie',
  needleleaved: 'Conifere',
  mixed: 'Bosco misto',
}

interface Props {
  flora: FloraResult | null
  floraLoading?: boolean
}

export function FloraPanel({ flora, floraLoading: loading }: Props) {
  if (loading) {
    return <div className="h-16 bg-stone-100 rounded-xl animate-pulse" />
  }
  if (!flora || !flora.available) {
    return (
      <div className="space-y-2">
        <p className={`text-sm font-semibold flex items-center gap-1.5 ${textPrimary}`}><Leaf className="w-4 h-4 text-emerald-400" /> Specie arboree e flora</p>
        <p className={`text-xs ${textMuted}`}>Dati sulla vegetazione non disponibili per questo percorso.</p>
      </div>
    )
  }

  const belt = flora.estimatedBelt
  // Tipologie riscontrate: quelle confermate (tipo foglia dominante + specie annotate) e, solo
  // in mancanza di dati confermati, la fascia vegetazionale stimata da quota/posizione — marcata
  // con un asterisco invece di spiegare in prosa da dove viene la stima.
  const confirmed = [
    ...(flora.leafTypeDominant ? [LEAF_TYPE_LABEL[flora.leafTypeDominant]] : []),
    ...flora.speciesFound,
  ]
  const estimated = confirmed.length === 0 && belt ? [belt.label] : []
  const hasEstimate = estimated.length > 0

  return (
    <div className="space-y-2">
      <p className={`text-sm font-semibold flex items-center gap-1.5 ${textPrimary}`}><Leaf className="w-4 h-4 text-emerald-400" /> Specie arboree e flora</p>
      {flora.forestCoveragePct != null && (
        <p className={`text-xs ${textMuted}`}>Copertura boschiva ~{flora.forestCoveragePct}%</p>
      )}
      {confirmed.length + estimated.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {confirmed.map(s => (
            <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{s}</span>
          ))}
          {estimated.map(s => (
            <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-stone-50 text-stone-500 border border-stone-200">{s} *</span>
          ))}
        </div>
      ) : (
        <p className={`text-xs italic ${textMuted}`}>Nessuna tipologia specifica riscontrata per quest&apos;area.</p>
      )}
      {hasEstimate && (
        <p className="text-[10px] text-stone-400 italic pt-0.5">* stimato in base a quota e posizione, non confermato</p>
      )}
    </div>
  )
}
