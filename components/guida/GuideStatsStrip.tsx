'use client'
import StatFigure from '@/components/ui/StatFigure'

interface Stat { value: string; label: string; href?: string }

interface Props {
  distanceKm: number
  elevationGain: number
  altitudeMax: number
  durationLabel: string
}

/** Cifre editoriali (StatFigure, vedi components/ui/StatFigure.tsx) al posto dei vecchi badge
 *  scritti a mano — pillole scorrevoli su mobile, riga fissa senza scroll da `md` in su. La
 *  distanza in auto dal punto di partenza vive solo in copertina (sotto la data, vedi
 *  GuideHero.tsx) — ripeterla anche qui accanto a Durata era ridondante. */
export default function GuideStatsStrip({ distanceKm, elevationGain, altitudeMax, durationLabel }: Props) {
  const stats: Stat[] = [
    { value: `${distanceKm.toFixed(1)} km`, label: 'Distanza' },
    { value: `+${Math.round(elevationGain)} m`, label: 'Dislivello' },
    { value: `${Math.round(altitudeMax)} m`, label: 'Quota max' },
    { value: durationLabel, label: 'Durata' },
  ]

  return (
    <div
      data-hscroll
      className="flex bg-stone-50 border-b border-stone-200 overflow-x-auto md:overflow-x-visible [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      {stats.map(({ value, label, href }, i) => {
        const figure = <StatFigure value={value} label={label} size="sm" className="items-center" />
        const className = 'flex-1 min-w-[22%] md:min-w-0 shrink-0 flex items-center justify-center py-3.5'
        const style = { borderRight: i < stats.length - 1 ? '1px solid #dcd8cc' : 'none' }
        return href ? (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={`${className} hover:bg-stone-100 transition-colors`} style={style}>
            {figure}
          </a>
        ) : (
          <div key={label} className={className} style={style}>{figure}</div>
        )
      })}
    </div>
  )
}
