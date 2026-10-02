import { useMemo } from 'react'
import { Loader2, X, Check, ChevronRight, BookOpen } from 'lucide-react'
import RouteMapSection from '@/components/RouteMapSection'
import type { TrackPoint } from '@/lib/tcxParser'
import type { CamminoPlan } from '@/lib/cammini/plan'
import { useCamminoDetail, dayColor } from '@/lib/cammini/useCamminoDetail'
import { buildSequence } from '@/lib/cammini/progress'
import { fmtDay, type TappaDone } from './CamminoTappaDetail'
import CamminoCtsBadge from './CamminoCtsBadge'

const WALK_KMH = 4
function fmtDur(sec: number): string {
  const min = Math.round(sec / 60)
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

/**
 * Mappa d'insieme del cammino nello stile della mappa del percorso dell'app (schermo intero, lucchetto, 3D):
 * ogni tappa è un tratto col suo numero — quadrato pieno se già percorsa, cerchio vuoto e tratto tratteggiato
 * se da fare. Toccando il numero si apre una scheda con i dati essenziali e il pulsante per aprire la tappa
 * (la guida, o il reportage della tappa nel reportage del cammino).
 */
export default function CamminoOverviewMap({ plan, done = {}, mode = 'guida', onOpen }: {
  plan: CamminoPlan
  done?: Record<number, TappaDone>
  mode?: 'guida' | 'reportage'
  /** Apre la tappa: `reportage` true quando la tappa è percorsa e si è nel reportage. */
  onOpen?: (ordinal: number, activityId?: string) => void
}) {
  const detail = useCamminoDetail(plan.camminoId)
  const seq = useMemo(() => buildSequence(plan), [plan])
  const trackPoints: TrackPoint[] = useMemo(() => {
    if (!detail) return []
    const by = new Map(detail.tappe.map(t => [t.ordinal, t]))
    const reverse = plan.direction === 'reverse'
    const pts: TrackPoint[] = []
    for (const x of seq) {
      const poly = by.get(x.ordinal)?.polyline
      if (!poly) continue
      for (const [lat, lon] of reverse ? [...poly].reverse() : poly) pts.push({ time: '', lat, lon })
    }
    return pts
  }, [detail, plan, seq])

  const overlayTracks = useMemo(() => {
    if (!detail) return []
    const by = new Map(detail.tappe.map(t => [t.ordinal, t]))
    const reverse = plan.direction === 'reverse'
    return seq.flatMap(x => {
      const poly = by.get(x.ordinal)?.polyline
      if (!poly || poly.length < 2) return []
      const pts = (reverse ? [...poly].reverse() : poly).map(([lat, lon]) => [lat, lon] as [number, number])
      return [{ id: x.ordinal, label: String(x.seq), color: dayColor(x.dayIdx), points: pts, done: !!done[x.ordinal] }]
    })
  }, [detail, plan, seq, done])

  if (trackPoints.length < 2) {
    return <div className="flex h-[260px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-100 text-[12px] text-stone-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carico la mappa…</div>
  }

  const card = (id: string | number, close: () => void) => {
    const x = seq.find(s => s.ordinal === id)
    if (!x) return null
    const t = x.tappa
    const d = done[x.ordinal]
    const day = plan.days[x.dayIdx]
    const km = (d ? d.distanceMeters : t.lengthM) / 1000
    const up = d ? d.elevationGain : t.elevationGainM
    const time = d ? fmtDur(d.totalTimeSeconds) : fmtDur((t.lengthM / 1000 / WALK_KMH) * 3600)
    const asReportage = mode === 'reportage' && !!d
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[13px] font-bold"
            style={d ? { background: dayColor(x.dayIdx), color: '#fff', borderRadius: 7 } : { border: `2.5px solid ${dayColor(x.dayIdx)}`, color: dayColor(x.dayIdx), borderRadius: '50%' }}>{x.seq}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-barlow text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">Giorno {x.dayIdx + 1}{day?.date ? ` · ${fmtDay(day.date)}` : ''}</p>
              {d ? <span className="flex items-center gap-0.5 rounded-full bg-forest-100 px-1.5 py-px text-[9.5px] font-bold uppercase text-forest-800"><Check className="h-2.5 w-2.5" /> Percorsa</span> : <span className="rounded-full bg-stone-100 px-1.5 py-px text-[9.5px] font-bold uppercase text-stone-500">Da fare</span>}
            </div>
            <p className="truncate font-display text-[15px] font-bold text-stone-800">{t.fromName ?? 'Partenza'} → {t.toName ?? 'Arrivo'}</p>
            <p className="mt-0.5 text-[12px] text-stone-500">{km.toFixed(1).replace('.', ',')} km · {time}{d ? '' : ' (stima)'}{up != null ? ` · +${Math.round(up)} m` : ''}</p>
          </div>
          {t.cts && <CamminoCtsBadge total={t.cts.total ?? t.cts.ts} safety={t.cts.safety ?? null} size={34} />}
          <button type="button" onClick={close} aria-label="Chiudi" className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100"><X className="h-4 w-4" /></button>
        </div>
        {onOpen && (
          <button type="button" onClick={() => onOpen(x.ordinal, d?.activityId)}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-forest-600 py-2.5 text-[13px] font-bold text-white">
            {asReportage ? <><BookOpen className="h-4 w-4" /> Apri il reportage della tappa</> : <>Apri la guida della tappa <ChevronRight className="h-4 w-4" /></>}
          </button>
        )}
      </div>
    )
  }

  return <RouteMapSection trackPoints={trackPoints} showPois={false} showProfile={false} planned overlayTracks={overlayTracks} overlayCard={card} />
}
