import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import RouteMapSection from '@/components/RouteMapSection'
import type { TrackPoint } from '@/lib/tcxParser'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { useCamminoDetail } from '@/lib/cammini/useCamminoDetail'
import { buildSequence } from '@/lib/cammini/progress'

/** Mappa d'insieme del tratto scelto, nello stile della mappa del percorso dell'app (schermo intero, lucchetto). */
export default function CamminoOverviewMap({ plan }: { plan: CamminoPlan }) {
  const detail = useCamminoDetail(plan.camminoId)
  const trackPoints: TrackPoint[] = useMemo(() => {
    if (!detail) return []
    const by = new Map(detail.tappe.map(t => [t.ordinal, t]))
    const reverse = plan.direction === 'reverse'
    const pts: TrackPoint[] = []
    for (const x of buildSequence(plan)) {
      const poly = by.get(x.ordinal)?.polyline
      if (!poly) continue
      for (const [lat, lon] of reverse ? [...poly].reverse() : poly) pts.push({ time: '', lat, lon })
    }
    return pts
  }, [detail, plan])

  if (trackPoints.length < 2) {
    return <div className="flex h-[260px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-100 text-[12px] text-stone-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carico la mappa…</div>
  }
  return <RouteMapSection trackPoints={trackPoints} showPois={false} showProfile={false} planned />
}
