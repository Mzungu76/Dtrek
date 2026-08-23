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

// Stessi dati di prima (tipo foglia dominante + specie annotate, o in mancanza di quelle la
// fascia vegetazionale stimata da quota/posizione) ma in una frase sola invece di riga
// stat+pillole+nota a parte — piano semplificazione visiva.
function buildSentence(flora: FloraResult): string {
  const leafLabel = flora.leafTypeDominant ? LEAF_TYPE_LABEL[flora.leafTypeDominant] : null
  const species = flora.speciesFound
  const coverage = flora.forestCoveragePct

  let sentence: string
  if (leafLabel) {
    sentence = species.length > 0
      ? `Bosco di ${leafLabel}, con ${species.join(', ')} tra le specie individuate in zona`
      : `Bosco di ${leafLabel}`
    if (coverage != null) sentence += `, copertura boschiva ~${coverage}%`
  } else if (species.length > 0) {
    sentence = `Specie individuate in zona: ${species.join(', ')}`
    if (coverage != null) sentence += ` — copertura boschiva ~${coverage}%`
  } else if (flora.estimatedBelt) {
    sentence = `Probabile ${flora.estimatedBelt.label}, stimata in base a quota e posizione — nessuna specie confermata in zona`
  } else {
    return "Nessuna tipologia specifica riscontrata per quest'area."
  }
  return sentence.endsWith('.') ? sentence : `${sentence}.`
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

  return (
    <div className="space-y-1.5">
      <p className={`text-sm font-semibold flex items-center gap-1.5 ${textPrimary}`}><Leaf className="w-4 h-4 text-emerald-400" /> Specie arboree e flora</p>
      <p className={`text-xs leading-relaxed ${textMuted}`}>{buildSentence(flora)}</p>
    </div>
  )
}
