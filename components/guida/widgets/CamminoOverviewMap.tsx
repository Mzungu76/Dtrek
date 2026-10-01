import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { useCamminoDetail, dayColor } from '@/lib/cammini/useCamminoDetail'
import type { RouteMapLine } from './CamminoRouteMap'

const CamminoRouteMap = dynamic(() => import('./CamminoRouteMap'), { ssr: false })

/** Mappa d'insieme del tratto scelto: una linea per tappa, colorata per giornata, numerata nell'ordine di marcia. */
export default function CamminoOverviewMap({ plan }: { plan: CamminoPlan }) {
  const detail = useCamminoDetail(plan.camminoId)
  if (!detail) {
    return <div className="h-[260px] rounded-xl bg-stone-50 flex items-center justify-center text-[12px] text-stone-400"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carico la mappa…</div>
  }
  const byOrdinal = new Map(detail.tappe.map(t => [t.ordinal, t]))
  const lines: RouteMapLine[] = []
  let n = 0
  plan.days.forEach((day, di) => {
    for (const o of day.tappe) {
      n += 1
      const t = byOrdinal.get(o)
      if (t) lines.push({ id: o, points: t.polyline, color: dayColor(di), label: String(n) })
    }
  })
  return (
    <div className="space-y-1.5">
      <CamminoRouteMap lines={lines} height={260} />
      <p className="text-[10.5px] text-stone-400">Un colore per giornata, numeri nell&apos;ordine di marcia. Sblocca la mappa con il lucchetto per muoverla.</p>
    </div>
  )
}
