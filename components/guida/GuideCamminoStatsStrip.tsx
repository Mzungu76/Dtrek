import StatFigure from '@/components/ui/StatFigure'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { planTotals } from '@/lib/cammini/guideBlocks'

/** Striscia di cifre per un Cammino: distanza, tappe, giornate, durata di marcia. Niente dislivello
 *  né quota massima qui — il cammino non ha una traccia con quote; il D+ sta tappa per tappa. */
export default function GuideCamminoStatsStrip({ plan }: { plan: CamminoPlan }) {
  const t = planTotals(plan)
  const h = Math.floor(t.seconds / 3600), m = Math.round((t.seconds % 3600) / 60)
  const stats = [
    { value: `${(t.lengthM / 1000).toFixed(t.lengthM >= 100_000 ? 0 : 1)} km`, label: 'Distanza' },
    { value: String(t.tappe), label: t.tappe === 1 ? 'Tappa' : 'Tappe' },
    { value: String(t.days), label: t.days === 1 ? 'Giorno' : 'Giorni' },
    { value: `${h} h ${String(m).padStart(2, '0')}`, label: 'Cammino' },
  ]
  return (
    <div data-hscroll className="flex bg-stone-50 border-b border-stone-200 overflow-x-auto md:overflow-x-visible [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
      {stats.map(({ value, label }, i) => (
        <div key={label} className="flex-1 min-w-[22%] md:min-w-0 shrink-0 flex items-center justify-center py-3.5" style={{ borderRight: i < stats.length - 1 ? '1px solid #dcd8cc' : 'none' }}>
          <StatFigure value={value} label={label} size="sm" className="items-center" />
        </div>
      ))}
    </div>
  )
}
