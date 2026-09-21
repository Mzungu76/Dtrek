import StatFigure from '@/components/ui/StatFigure'

interface Props {
  /** Numero di tappe (lib/guideBorgoDetailStops.ts) — assente/0 quando la scoperta non ha trovato
   *  nulla nel raggio: in quel caso la striscia mostra solo le pillole che hanno senso comunque
   *  (mai "0 tappe" fabbricato, stesso principio di lib/metaCard.ts). */
  stopsCount?: number
  walkDistanceKm?: number
  walkDurationLabel?: string
  categoryLabel: string
}

/** Striscia di pillole per un Borgo/Città "cammino urbano" (lib/guideCardVariant.ts) — stesso
 *  linguaggio visivo di GuideStatsStrip (sentiero/borgo "trekking misto"), metriche di visita al
 *  posto di quelle escursionistiche: qui non esistono distanza/dislivello di un percorso, solo
 *  quanto c'è da vedere e quanto tempo richiede. */
export default function GuideBorgoStatsStrip({ stopsCount, walkDistanceKm, walkDurationLabel, categoryLabel }: Props) {
  const stats: { value: string; label: string }[] = []
  if (stopsCount != null && stopsCount > 0) stats.push({ value: String(stopsCount), label: 'Tappe' })
  if (walkDistanceKm != null) stats.push({ value: `${walkDistanceKm.toFixed(1)} km`, label: 'A piedi' })
  if (walkDurationLabel) stats.push({ value: walkDurationLabel, label: 'Durata giro' })
  stats.push({ value: categoryLabel, label: 'Categoria' })

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
