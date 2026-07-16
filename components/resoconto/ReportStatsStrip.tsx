'use client'
import StatFigure from '@/components/ui/StatFigure'

interface Stat { value: string; label: string }

interface Props {
  distanceKm: number
  elevationGain: number
  durationLabel: string
  /** Quarta cifra: calorie se note, altrimenti FC media se nota — altrimenti la striscia mostra
   *  solo le prime tre (mai un dato mancante). */
  fourth?: { value: string; label: string }
}

/** Cifre editoriali (StatFigure) per il resoconto — stessa impaginazione della striscia di Guida
 *  (components/guida/GuideStatsStrip.tsx), condivisa via components/ui/StatFigure.tsx. */
export default function ReportStatsStrip({ distanceKm, elevationGain, durationLabel, fourth }: Props) {
  const stats: Stat[] = [
    { value: `${distanceKm.toFixed(1)} km`, label: 'Distanza' },
    { value: `+${Math.round(elevationGain)} m`, label: 'Dislivello' },
    { value: durationLabel, label: 'Durata' },
    ...(fourth ? [fourth] : []),
  ]

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
