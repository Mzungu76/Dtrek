'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Flag, Droplets, AlertTriangle } from 'lucide-react'
import { POI_META, type PoiItem } from '@/lib/overpass'
import { POI_ICON } from '@/components/poiIcons'
import { poisAhead, etaAtDistance, delayVsPlanMin } from '@/lib/cammini/ahead'
import { SERVICE_META, type ServiceCategory, type ServiceItem } from '@/lib/cammini/services'
import { placeServices, nextOfCategory, waterAdvice } from '@/lib/cammini/serviceGaps'

interface Props {
  pois: PoiItem[]
  routePolyline: [number, number][]
  alongM: number
  totalM: number | null
  remainingM: number
  remainingTimeSec: number | null
  movingTimeSec: number
  plannedPaceMs: number | null
  /** Acqua, cibo, alloggi, trasporti lungo la tappa (OSM): assenti = si mostrano solo i luoghi. */
  services?: ServiceItem[]
  highContrast?: boolean
}

const hhmm = (d: Date) => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
const fmtDist = (m: number) => (m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`)

/** "Davanti a te": i prossimi luoghi della tappa, a distanza di strada dalla posizione, con ora di arrivo e scarto dal piano. */
export default function CamminoAheadCard({ pois, routePolyline, alongM, totalM, remainingM, remainingTimeSec, movingTimeSec, plannedPaceMs, services, highContrast }: Props) {
  const [open, setOpen] = useState(false)
  const items = useMemo(() => poisAhead(pois, routePolyline, alongM, totalM, { limit: 6 }), [pois, routePolyline, alongM, totalM])
  const now = new Date()
  const placed = useMemo(() => placeServices(services ?? [], routePolyline, totalM), [services, routePolyline, totalM])
  const water = services && services.length > 0 ? waterAdvice(placed, alongM, totalM ?? alongM + remainingM) : null
  // Avviso sull'acqua: finita la tappa senza o con un lungo tratto asciutto dopo il prossimo punto. Mai dato per certo:
  // OpenStreetMap dice dove una fontana è mappata, non se oggi dà acqua.
  const waterWarning = !water ? null
    : water.nextM == null ? 'Nessuna acqua mappata fino all\'arrivo: portane abbastanza'
    : water.nextM <= 2000 && (water.gapAfterM ?? 0) >= 10000 ? `Dopo questa acqua niente per ${fmtDist(water.gapAfterM!)}: riempi qui`
    : null
  const needs = (['water', 'food', 'shop', 'lodging', 'transport'] as ServiceCategory[])
    .map(c => ({ c, next: nextOfCategory(placed, c, alongM) }))
    .filter(x => x.next)
  const arrival = etaAtDistance(remainingM, remainingM, remainingTimeSec, now)
  const delay = delayVsPlanMin(movingTimeSec, remainingTimeSec, totalM ?? 0, plannedPaceMs)
  if (items.length === 0 && !arrival) return null

  const first = items[0]
  const bg = highContrast ? 'bg-black' : 'bg-black/55 backdrop-blur-sm'
  const label = (p: PoiItem) => p.name ?? POI_META[p.type]?.label ?? 'Luogo'
  const icon = (p: PoiItem) => {
    const Icon = POI_ICON[p.type]
    return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: POI_META[p.type]?.color ?? '#6b7280' }}>{Icon && <Icon className="h-3 w-3 text-white" />}</span>
  }

  return (
    <div className={`w-full rounded-2xl text-white ${bg}`}>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={open}>
        {first ? icon(first.poi) : <Flag className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {first ? `${label(first.poi)} · ${fmtDist(first.distanceM)}` : `Arrivo · ${fmtDist(remainingM)}`}
        </span>
        {delay != null && Math.abs(delay) >= 5 && (
          <span className={`shrink-0 text-[11px] font-bold ${delay > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{delay > 0 ? `+${delay}` : delay} min</span>
        )}
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      {waterWarning && (
        <p className="flex items-center gap-1.5 px-3 pb-2 text-[11.5px] font-semibold text-amber-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{waterWarning}</p>
      )}
      {open && needs.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 border-t border-white/10 px-3 py-2 text-[12px]">
          {needs.map(({ c, next }) => (
            <li key={c} className="flex items-center gap-1">
              {c === 'water' && <Droplets className="h-3.5 w-3.5 text-sky-300" />}
              <span className="text-white/70">{SERVICE_META[c].label}</span>
              <span className="font-bold tabular-nums">{fmtDist(next!.distanceM)}</span>
              {next!.service.confidence === 'bassa' && <span className="text-white/50" title="Dato OpenStreetMap non verificato">?</span>}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ul className="divide-y divide-white/10 px-3 pb-2">
          {items.map(({ poi, distanceM, offRouteM }) => {
            const eta = etaAtDistance(distanceM, remainingM, remainingTimeSec, now)
            return (
              <li key={poi.id} className="flex items-center gap-2 py-1.5 text-[12.5px]">
                {icon(poi)}
                <span className="min-w-0 flex-1 truncate">{label(poi)}{offRouteM > 120 && <span className="text-white/60"> · a {fmtDist(offRouteM)} dal sentiero</span>}</span>
                <span className="shrink-0 font-bold tabular-nums">{fmtDist(distanceM)}</span>
                {eta && <span className="w-11 shrink-0 text-right text-white/70 tabular-nums">{hhmm(eta)}</span>}
              </li>
            )
          })}
          <li className="flex items-center gap-2 py-1.5 text-[12.5px] font-bold">
            <Flag className="h-4 w-4 shrink-0" />
            <span className="flex-1">Arrivo tappa</span>
            <span className="tabular-nums">{fmtDist(remainingM)}</span>
            {arrival && <span className="w-11 text-right tabular-nums">{hhmm(arrival)}</span>}
          </li>
        </ul>
      )}
    </div>
  )
}
