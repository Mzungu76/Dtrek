'use client'
import StatFigure from '@/components/ui/StatFigure'

import type { ReportFact } from '@/lib/reportFacts'

interface Props {
  /** Cifre già scelte per la tipologia (lib/reportFacts.ts): km/D+/durata per un Sentiero, tappe e
   *  durata per un Borgo/Città, tipo e verifica per un Sito. Vuoto ⇒ la striscia non compare. */
  facts: ReportFact[]
}

/** Cifre editoriali (StatFigure) per il resoconto — stessa impaginazione della striscia di Guida
 *  (components/guida/GuideStatsStrip.tsx), condivisa via components/ui/StatFigure.tsx. */
export default function ReportStatsStrip({ facts }: Props) {
  const stats = facts
  if (stats.length === 0) return null

  return (
    <div
      data-hscroll
      className="flex bg-stone-50 border-b border-stone-200 overflow-x-auto md:overflow-x-visible [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {stats.map(({ value, label }, i) => (
        <div
          key={label}
          className="flex-1 min-w-[22%] md:min-w-0 shrink-0 flex items-center justify-center py-3.5"
          style={{ borderRight: i < stats.length - 1 ? '1px solid #dcd8cc' : 'none' }}
        >
          <StatFigure value={value} label={label} size="sm" className="items-center" />
        </div>
      ))}
    </div>
  )
}
